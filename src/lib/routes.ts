// Tab ⇄ URL mapping for state-based navigation.
// The app has no router library; this keeps browser URLs real so links,
// back/forward, refresh, and direct access all work.

export const TAB_ROUTES: Record<string, string> = {
  dashboard: '/',
  videos: '/videos',
  queue: '/queue',
  calendar: '/calendar',
  connections: '/connections',
  aistudio: '/ai-studio',
  drive: '/drive',
  automations: '/automations',
  retention: '/analytics',
  reports: '/history',
  team: '/team',
  brands: '/brands',
  profile: '/profile',
  autopilot: '/autopilot',
  experiments: '/experiments',
  content: '/content',
  timing: '/timing',
  strategist: '/strategist',
  matrix: '/matrix',
  admin: '/admin',
  landing: '/',
};

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_ROUTES).map(([tab, path]) => [path, tab])
);

export function pathForTab(tab: string): string {
  return TAB_ROUTES[tab] || '/';
}

export function tabFromPath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  // Dedicated brand pages: /brands/<brandId>
  if (clean.startsWith('/brands/')) return 'branddetail';
  return PATH_TO_TAB[clean] || 'dashboard';
}

export function brandIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/brands\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
