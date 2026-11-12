import React from 'react';

interface SaaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

// Publora brand mark — geometric P monogram:
// a continuous stem flowing into a rounded bowl that terminates in a node,
// expressing content workflows, forward motion, and connection.
export const PubloraMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img src="/Publora-icon.svg" alt="" className={className} aria-hidden="true" />
);
export const SaaLogo: React.FC<SaaLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const iconSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const textClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <div className={`flex items-center space-x-2.5 ${className}`}>
      <div
        className={`${iconSize} rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center p-1 flex-shrink-0`}
        aria-hidden="true"
      >
        <PubloraMark className="w-full h-full" />
      </div>

      <div className="flex flex-col">
        <span
          className={`font-extrabold tracking-tight text-[var(--text-primary)] ${textClass}`}
          style={{ fontFamily: "'Manrope', 'Inter', sans-serif" }}
        >
          PUBLORA
        </span>
        {showSubtitle && (
          <span className="text-[10px] text-[var(--text-muted)] tracking-wide -mt-0.5 hidden xl:block">
            Publish smarter. Grow further.
          </span>
        )}
      </div>
    </div>
  );
};
