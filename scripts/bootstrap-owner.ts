/**
 * scripts/bootstrap-owner.ts — one-time, manual owner bootstrap.
 *
 * Grants the 'god' role and anchors primaryOwnerUserId to an EXISTING,
 * verified, active user — proving account ownership is the operator's job,
 * not something registration or email-matching can do.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-owner.ts <userId|email>
 *
 * Safety properties:
 *  - Refuses users that are missing, suspended, or unverified.
 *  - Idempotent for the same owner (re-running is a no-op success).
 *  - Refuses to move an existing anchor to a different user.
 *  - Never creates users and never runs at server startup.
 *  - Prints no secrets.
 */
import '../server/env.ts';
import * as db from '../server/saasDb.ts';
import { authStore } from '../server/authStore.ts';
import { query } from '../server/db/client.ts';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: npx tsx scripts/bootstrap-owner.ts <userId|email>');
    process.exit(2);
  }

  const all = await authStore.listUsers();
  const user = all.find((u: any) =>
    u.id === target || u.legacyId === target || u.email?.toLowerCase() === target.toLowerCase());

  if (!user) {
    console.error(`REFUSED: no user matches "${target}". Create and verify the account first.`);
    process.exit(1);
  }
  if (user.status !== 'active') {
    console.error(`REFUSED: user ${user.id} is ${user.status} — reactivate before bootstrap.`);
    process.exit(1);
  }
  if (!user.isEmailVerified) {
    console.error(`REFUSED: user ${user.id} (${user.email}) is not email-verified — verify the account first.`);
    process.exit(1);
  }

  const settings = db.getSystemSettings() as any;
  const anchor = settings?.primaryOwnerUserId;

  if (anchor && anchor !== user.id) {
    console.error(`REFUSED: primaryOwnerUserId is already anchored to ${anchor}. Ownership transfer is a separate, explicit operation.`);
    process.exit(1);
  }

  const alreadyGod = user.role === 'god' && (!anchor || anchor === user.id);
  if (alreadyGod) {
    console.log(`OK: ${user.email} (${user.id}) is already the anchored Primary Owner. No changes.`);
    process.exit(0);
  }

  // updateUser deliberately rejects role='god' — this trusted local path
  // performs the grant directly, per driver.
  if ((process.env.DB_DRIVER || 'json').toLowerCase() === 'pg') {
    await query(`UPDATE users SET role='god', updated_at=now() WHERE legacy_id=$1 OR id::text=$1`, [user.id, user.id]);
  } else {
    const d = db.getDb();
    const u = (d.users || []).find((x: any) => x.id === user.id);
    if (u) { u.role = 'god'; db.saveDatabase(d); }
  }
  if (!anchor) {
    db.updateSystemSettings({ primaryOwnerUserId: user.id } as any);
  }

  try {
    await authStore.logAudit({
      workspaceId: 'platform',
      userId: user.id,
      action: 'owner_bootstrap',
      details: `Primary Owner role anchored to ${user.email} (${user.id}) via scripts/bootstrap-owner.ts`,
    });
  } catch { /* audit is best-effort */ }

  console.log(`OK: ${user.email} (${user.id}) is now the Primary Owner (god).`);
  process.exit(0);
}

main().catch((e) => { console.error('bootstrap failed:', e?.message || e); process.exit(1); });
