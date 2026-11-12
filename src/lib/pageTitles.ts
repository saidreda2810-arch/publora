import { useEffect } from 'react';

const BRAND = 'Publora';

/** Central route/tab → page title map. Keep in sync with App.tsx activeTab values. */
export const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  videos: 'Video Library',
  drive: 'Google Drive',
  aistudio: 'AI Studio',
  connections: 'Social Accounts',
  queue: 'Publishing Queue',
  calendar: 'Calendar',
  automations: 'Automations',
  retention: 'Analytics',
  reports: 'Publishing History',
  team: 'Team Management',
  brands: 'Brands',
  profile: 'Profile & Settings',
  autopilot: 'Autopilot',
  experiments: 'Experiments',
  content: 'Content Intelligence',
  timing: 'Publishing Time Optimizer',
  strategist: 'AI Strategist',
  matrix: 'Metric Availability',
  admin: 'Admin Dashboard',
  landing: 'Home',
};

export const DEFAULT_TITLE = `Dashboard | ${BRAND}`;
export const FALLBACK_TITLE = `Publora`;

export function titleForTab(tab: string | undefined | null): string {
  if (!tab) return FALLBACK_TITLE;
  // Support "tab:subsection" keys (e.g. profile:security)
  const [base, sub] = tab.split(':');
  const baseName = PAGE_TITLES[base];
  if (!baseName) return FALLBACK_TITLE;
  if (sub) {
    const subName = sub.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `${subName} | ${baseName} | ${BRAND}`;
  }
  return `${baseName} | ${BRAND}`;
}

/** Sets document.title for the given tab. */
export function usePageTitle(tab: string | undefined | null) {
  useEffect(() => {
    document.title = titleForTab(tab);
  }, [tab]);
}
