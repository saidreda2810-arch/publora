import nodemailer from 'nodemailer';
import { query } from './db/client.ts';

/**
 * Transactional mailer.
 *
 * Provider selection:
 *  - SMTP_HOST set  → real SMTP delivery via nodemailer
 *  - otherwise      → 'log' provider: message is written to server logs and
 *                     the caller is told delivery did NOT happen (sent:false).
 *                     Callers must keep their dev-token fallback for this case.
 *
 * Env: SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true"→465),
 *      SMTP_USER, SMTP_PASS, MAIL_FROM (default "SRA Publisher <no-reply@localhost>")
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Outbox template tag (verification, password_reset, magic_link, email_change, generic) */
  template?: string;
}

export interface MailResult {
  sent: boolean;
  provider: 'smtp' | 'log';
  error?: string;
}

let transporter: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  return transporter;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

const isPg = () => (process.env.DB_DRIVER || 'json').toLowerCase() === 'pg';
const MAX_OUTBOX_ATTEMPTS = 10;

/** Enqueue into outbox_emails and return the row id (pg mode only). */
async function outboxEnqueue(msg: MailMessage): Promise<string | null> {
  if (!isPg()) return null;
  try {
    const r = await query(
      `INSERT INTO outbox_emails(to_email, template, payload, status, next_attempt_at)
       VALUES($1, $2, $3::jsonb, 'pending', now()) RETURNING id`,
      [msg.to, msg.template || 'generic', JSON.stringify({ subject: msg.subject, text: msg.text, html: msg.html || null })]
    );
    return r.rows[0]?.id || null;
  } catch (e: any) {
    console.error('[mailer] outbox enqueue failed:', e?.message || e);
    return null;
  }
}

async function outboxMark(id: string | null, ok: boolean, error?: string): Promise<void> {
  if (!id || !isPg()) return;
  try {
    if (ok) {
      await query(`UPDATE outbox_emails SET status='sent', sent_at=now(), attempts=attempts+1, last_error=NULL WHERE id=$1`, [id]);
    } else {
      await query(
        `UPDATE outbox_emails SET attempts=attempts+1, last_error=$2,
           status=CASE WHEN attempts+1 >= $3 THEN 'failed' ELSE 'pending' END,
           next_attempt_at=now() + (least(power(2, attempts+1), 240) || ' minutes')::interval
         WHERE id=$1`,
        [id, String(error || 'send failed').slice(0, 500), MAX_OUTBOX_ATTEMPTS]
      );
    }
  } catch (e: any) {
    console.error('[mailer] outbox update failed:', e?.message || e);
  }
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const t = getTransporter();
  const from = process.env.MAIL_FROM || 'SRA Publisher <no-reply@localhost>';

  if (!t) {
    // Honest fallback: no SMTP configured — log the intent, report not sent.
    console.log(`[mailer:log] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { sent: false, provider: 'log' };
  }

  // Durable path: enqueue first so a crash between send and record can't lose it
  const outboxId = await outboxEnqueue(msg);

  try {
    await t.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    await outboxMark(outboxId, true);
    return { sent: true, provider: 'smtp' };
  } catch (e: any) {
    console.error('[mailer] SMTP send failed:', e?.message || e);
    await outboxMark(outboxId, false, e?.message || String(e));
    return { sent: false, provider: 'smtp', error: e?.message || String(e) };
  }
}

/** Drain due outbox rows — called by the periodic worker. */
export async function processOutboxBatch(limit = 20): Promise<number> {
  if (!isPg() || !getTransporter()) return 0;
  const t = getTransporter()!;
  const from = process.env.MAIL_FROM || 'SRA Publisher <no-reply@localhost>';
  let processed = 0;
  try {
    const due = await query(
      `SELECT id, to_email, payload FROM outbox_emails
       WHERE status='pending' AND next_attempt_at <= now() AND attempts < $1
       ORDER BY next_attempt_at LIMIT $2`,
      [MAX_OUTBOX_ATTEMPTS, limit]
    );
    for (const row of due.rows) {
      const p = row.payload || {};
      try {
        await t.sendMail({ from, to: row.to_email, subject: p.subject || '(no subject)', text: p.text || '', html: p.html || undefined });
        await outboxMark(row.id, true);
      } catch (e: any) {
        await outboxMark(row.id, false, e?.message || String(e));
      }
      processed++;
    }
  } catch (e: any) {
    console.error('[mailer] outbox drain failed:', e?.message || e);
  }
  return processed;
}

let outboxTimer: NodeJS.Timeout | null = null;
export function startMailOutboxWorker(intervalMs = 30_000): void {
  if (outboxTimer || !isPg()) return;
  outboxTimer = setInterval(() => { void processOutboxBatch(); }, intervalMs);
  outboxTimer.unref?.();
}

export interface MailTemplate {
  subject: string;
  text: string;
  html?: string;
}

// ---- Branded templates ----

const APP_NAME = 'SRA Social Publisher';

export function verificationEmail(token: string): MailTemplate {
  const appUrl = (process.env.APP_URL || process.env.SHARED_APP_URL || '').replace(/\/$/, '');
  const link = appUrl ? `${appUrl}/?verifyToken=${encodeURIComponent(token)}` : `(no APP_URL configured) token: ${token}`;
  return {
    subject: `Verify your ${APP_NAME} email`,
    text: `Welcome! Verify your email address by entering this token in the app:\n\n${token}\n\nOr open: ${link}\n\nThis link expires shortly. If you didn't create an account, ignore this email.`,
    html: `<p>Welcome! Verify your email address:</p><p><a href="${link}">${link}</a></p><p>Or enter token: <code>${token}</code></p>`,
  };
}

export function passwordResetEmail(token: string): MailTemplate {
  const appUrl = (process.env.APP_URL || process.env.SHARED_APP_URL || '').replace(/\/$/, '');
  const link = appUrl ? `${appUrl}/?resetToken=${encodeURIComponent(token)}` : `(no APP_URL configured) token: ${token}`;
  return {
    subject: `${APP_NAME} — password reset`,
    text: `A password reset was requested for your account.\n\nUse this token in the app to set a new password:\n\n${token}\n\nOr open: ${link}\n\nThis token expires in 60 minutes. If you didn't request this, ignore this email.`,
    html: `<p>A password reset was requested for your account.</p><p><a href="${link}">Reset your password</a></p><p>Or enter token: <code>${token}</code></p><p>This token expires in 60 minutes.</p>`,
  };
}

export function emailChangeEmail(token: string, newEmail: string): MailTemplate {
  return {
    subject: `${APP_NAME} — confirm email change`,
    text: `A request was made to change the email on your account to ${newEmail}.\n\nEnter this token in the app to confirm:\n\n${token}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>A request was made to change the email on your account to <b>${newEmail}</b>.</p><p>Enter this token in the app to confirm:</p><p><code>${token}</code></p>`,
  };
}
