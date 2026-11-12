import React from 'react';

export const inputCls =
  'w-full px-3 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-border)] focus:ring-1 focus:ring-[var(--focus-ring)]/30 transition';

export const labelCls = 'block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1.5';

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] text-xs font-bold hover:bg-[var(--accent-primary-hover)] transition disabled:opacity-50 disabled:cursor-not-allowed';

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition disabled:opacity-50';

export const btnDanger =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[var(--status-error)] text-xs font-semibold hover:bg-rose-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed';

export const cardCls =
  'bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-6';

export const SectionCard: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}> = ({ title, description, icon, children, danger }) => (
  <section
    className={`${cardCls} ${danger ? 'border-rose-500/30' : ''}`}
  >
    <div className="flex items-start gap-3 mb-4">
      {icon && (
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            danger ? 'bg-rose-500/10 text-[var(--status-error)]' : 'bg-[var(--accent-subtle)] text-[var(--accent-ink)]'
          }`}
        >
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, hint, children, className }) => (
  <div className={className}>
    <label className={labelCls}>{label}</label>
    {children}
    {hint && <p className="text-[11px] text-[var(--text-muted)] mt-1">{hint}</p>}
  </div>
);

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-5.5 h-[22px] rounded-full transition-colors flex-shrink-0 ${
      checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-main)] border border-[var(--border-color)]'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
        checked ? 'left-[22px]' : 'left-[3px]'
      }`}
    />
  </button>
);

export const StatusPill: React.FC<{ tone: 'success' | 'warning' | 'error' | 'muted'; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const tones = {
    success: 'bg-emerald-500/10 text-[var(--status-success)] border-emerald-500/30',
    warning: 'bg-amber-500/10 text-[var(--status-warning)] border-amber-500/30',
    error: 'bg-rose-500/10 text-[var(--status-error)] border-rose-500/30',
    muted: 'bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border-color)]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
};

export function formatDate(iso?: string | null): string {
  if (!iso) return '”';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '”';
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '”';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '”';
  }
}

export function Avatar({ name, src, size = 40 }: { name?: string; src?: string; size?: number }) {
  const initials = (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className="rounded-full object-cover border border-[var(--border-color)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-[var(--accent-ink)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
