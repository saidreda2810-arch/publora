import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePublisher } from '../context/PublisherContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SaaLogo, PubloraMark } from './common/SaaLogo';
import { ProfileMenu } from './profile/ProfileMenu';
import { pathForTab } from '../lib/routes';
import {
  Activity,
  Database,
  HardDrive,
  Sparkles,
  Key,
  CheckCircle2,
  Calendar,
  Cpu,
  Flame,
  Compass,
  FileText,
  Users,
  Bot,
  Settings,
  ShieldAlert,
  Building,
  PlusCircle,
  Sun,
  Moon,
  Search,
  ChevronDown,
  LogOut,
  Crown,
  Menu,
  X,
  Shield,
  Layers,
  HelpCircle,
  Bell,
  User,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

// Tooltip for the collapsed icon rail. Rendered through a portal so it is
// never clipped by the sidebar's overflow/scroll containers.
const RailTip: React.FC<{ label: string; children: React.ReactElement<any> }> = ({
  label,
  children,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const hide = () => setPos(null);
  const show = (e: React.SyntheticEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({
      x: Math.min(r.right + 10, window.innerWidth - 190),
      y: Math.min(Math.max(r.top + r.height / 2, 14), window.innerHeight - 14),
    });
  };
  useEffect(() => {
    if (!pos) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos !== null]);
  return (
    <>
      {React.cloneElement(children, {
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      })}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: pos.y, left: pos.x }}
            className="pointer-events-none fixed z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-color)] bg-[var(--bg-surface-hover)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-xl"
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
};

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenNewPost: () => void;
  onOpenNewVideo: () => void;
  onOpenNewBrand: () => void;
  onNavigateProfile?: (section?: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  children?: React.ReactNode;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewPost,
  onOpenNewVideo,
  onOpenNewBrand,
  onNavigateProfile,
  sidebarCollapsed,
  onToggleSidebar,
  children,
}) => {
  const {
    brands,
    activeBrandId,
    setActiveBrandId,
    activeBrand,
    autopilotConfig,
    toggleEmergencyPause,
    posts,
    accounts,
    videos,
  } = usePublisher();

  const {
    user,
    activeWorkspace,
    workspaces,
    switchWorkspace,
    createWorkspace,
    logout,
  } = useAuth();

  const { isDark, toggleTheme } = useTheme();

  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleCreateNewWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setIsCreatingWorkspace(true);
    try {
      await createWorkspace(newWorkspaceName.trim());
      setNewWorkspaceName('');
      setWorkspaceDropdownOpen(false);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'videos', label: 'Video Library', icon: Database, badge: videos.length },
    { id: 'drive', label: 'Google Drive', icon: HardDrive },
    { id: 'aistudio', label: 'AI Studio', icon: Sparkles },
    { id: 'connections', label: 'Social Accounts', icon: Key, badge: accounts.filter((a) => a.isConnected).length },
    { id: 'queue', label: 'Publishing Queue', icon: CheckCircle2, badge: posts.filter((p) => p.status === 'scheduled').length },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'automations', label: 'Automations', icon: Cpu },
    { id: 'retention', label: 'Analytics', icon: Flame },
    { id: 'reports', label: 'Publishing History', icon: FileText },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'brands', label: 'Brands', icon: Settings },
    { id: 'profile', label: 'Profile & Settings', icon: User },
  ];

  // GOD Admin menu item for saidreda2810@gmail.com
  if (user?.role === 'god' || user?.role === 'platform_admin') {
    navItems.push({
      id: 'admin',
      label: 'GOD Console',
      icon: Crown,
      badge: undefined,
    });
  }

  // Logical nav groups for the desktop sidebar (progressive disclosure:
  // Insights collapses to keep the primary path uncluttered)
  const navGroups: { title: string; ids: string[]; collapsible?: boolean }[] = [
    { title: 'Overview', ids: ['dashboard'] },
    { title: 'Content', ids: ['videos', 'queue', 'calendar', 'reports'] },
    { title: 'Accounts', ids: ['connections', 'brands', 'drive'] },
    { title: 'Insights', ids: ['retention', 'aistudio', 'automations'], collapsible: true },
    { title: 'System', ids: ['team', 'admin', 'profile'] },
  ];
  const [insightsOpen, setInsightsOpen] = useState(
    () => ['retention', 'aistudio', 'automations'].includes(activeTab)
  );

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.ids
        .map((id) => navItems.find((n) => n.id === id))
        .filter(Boolean) as typeof navItems,
    }))
    .filter((g) => g.items.length > 0);

  const currentTabLabel =
    activeTab === 'profile' ? 'Profile' : navItems.find((n) => n.id === activeTab)?.label || 'Dashboard';

  return (
    <>
      {/* =========================================================================
          1. DESKTOP FIXED SIDEBAR (240px wide) - Linear/Stripe/Vercel standard
         ========================================================================= */}
      <aside className={`hidden lg:flex sticky top-0 h-screen self-start shrink-0 ${sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'} bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] flex-col justify-between z-40 select-none motion-safe:transition-[width] motion-safe:duration-300`}>
        <div className="flex flex-col flex-1 min-h-0">
          {/* PUBLORA Logo Wordmark & Brand Header */}
          <div className={`h-14 border-b border-[var(--border-color)] flex items-center ${sidebarCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
            {sidebarCollapsed ? (
              <RailTip label="Dashboard">
                <a
                  href={pathForTab('dashboard')}
                  onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}
                  aria-label="Go to Dashboard"
                  className="w-6 h-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center p-1 hover:opacity-75 hover:border-[var(--accent-primary)]/40 transition"
                >
                  <PubloraMark className="w-full h-full" />
                </a>
              </RailTip>
            ) : (
              <>
                <a
                  href={pathForTab('dashboard')}
                  onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}
                  aria-label="Go to Dashboard"
                  title="Dashboard"
                  className="rounded-md hover:opacity-75 transition flex items-center"
                >
                  <SaaLogo size="sm" showSubtitle={false} />
                </a>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">
                    v2.5
                  </span>
                  <button
                    type="button"
                    onClick={onToggleSidebar}
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition"
                  >
                    <PanelLeftClose size={15} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Collapsed-state expand toggle row */}
          {sidebarCollapsed && (
            <div className="h-11 border-b border-[var(--border-color)] flex items-center justify-center">
              <RailTip label="Expand sidebar">
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  aria-label="Expand sidebar"
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition"
                >
                  <PanelLeftOpen size={16} />
                </button>
              </RailTip>
            </div>
          )}

          {/* Workspace Selector */}
          <div className={`${sidebarCollapsed ? 'px-2 py-2.5' : 'p-3'} border-b border-[var(--border-color)]`}>
            <div className="relative">
              {sidebarCollapsed ? (
                <RailTip label={`Workspace: ${activeWorkspace ? activeWorkspace.name : 'Personal Workspace'}`}>
                  <button
                    type="button"
                    onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
                    aria-label={`Workspace: ${activeWorkspace ? activeWorkspace.name : 'Personal Workspace'}`}
                    className="w-full flex items-center justify-center p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] transition"
                  >
                    <Building size={15} className="text-[var(--text-secondary)]" />
                  </button>
                </RailTip>
              ) : (
                <button
                  type="button"
                  onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
                  className="w-full flex items-center justify-between p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-xs transition text-left"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Building size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {activeWorkspace ? activeWorkspace.name : 'Personal Workspace'}
                    </span>
                  </div>
                  <ChevronDown size={13} className="text-[var(--text-muted)] flex-shrink-0 ml-1" />
                </button>
              )}

              {/* Workspace Dropdown */}
              {workspaceDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-50"
                    onClick={() => setWorkspaceDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1.5 w-60 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl p-2 z-50 text-xs space-y-1">
                    <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                      Workspaces ({workspaces.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => {
                            switchWorkspace(ws.id);
                            setWorkspaceDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition ${
                            activeWorkspace?.id === ws.id
                              ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)] font-medium'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          <span className="truncate">{ws.name}</span>
                          <span className="text-[9px] font-mono uppercase px-1 rounded bg-black/20 text-[var(--text-muted)]">
                            {ws.plan}
                          </span>
                        </button>
                      ))}
                    </div>

                    <form onSubmit={handleCreateNewWorkspace} className="pt-2 border-t border-[var(--border-color)] mt-1 space-y-1.5">
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="New workspace name..."
                        className="w-full px-2 py-1 rounded bg-[var(--bg-sidebar)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                      <button
                        type="submit"
                        disabled={isCreatingWorkspace || !newWorkspaceName.trim()}
                        className="w-full py-1 rounded bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold text-[11px] disabled:opacity-50"
                      >
                        {isCreatingWorkspace ? 'Creating...' : '+ Create Workspace'}
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Navigation Links — grouped with collapsible Insights */}
          <nav className={`flex-1 min-h-0 py-3 overflow-y-auto sidebar-scroll ${sidebarCollapsed ? 'px-1.5' : 'px-2.5'}`}>
            {visibleGroups.map((group) => {
              const isInsights = group.collapsible;
              // Collapsed rail can't host the group toggle — show all items
              const open = sidebarCollapsed || !isInsights || insightsOpen;
              return (
                <div key={group.title} className="mb-2">
                  {!sidebarCollapsed && (isInsights ? (
                    <button
                      type="button"
                      onClick={() => setInsightsOpen(!insightsOpen)}
                      className="w-full flex items-center justify-between px-2.5 pt-2 pb-1 text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition"
                    >
                      {group.title}
                      <ChevronRight
                        size={11}
                        className={`transition-transform ${insightsOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                  ) : (
                    <div className="px-2.5 pt-2 pb-1 text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                      {group.title}
                    </div>
                  ))}
                  {open && (
                    <div className={`space-y-0.5 ${sidebarCollapsed ? '' : ''}`}>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        const btn = (
                          <a
                            key={item.id}
                            href={pathForTab(item.id)}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveTab(item.id);
                            }}
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                            className={`w-full flex items-center rounded-lg text-xs transition ${
                              sidebarCollapsed ? 'justify-center px-0 py-2' : 'justify-between px-2.5 py-2'
                            } ${
                              isActive
                                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold border border-[var(--border-color)]'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                            }`}
                          >
                            {sidebarCollapsed ? (
                              <Icon
                                size={16}
                                className={isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}
                              />
                            ) : (
                              <>
                                <div className="flex items-center space-x-2.5 truncate">
                                  <Icon
                                    size={15}
                                    className={isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}
                                  />
                                  <span className="truncate">{item.label}</span>
                                </div>
                                {item.badge !== undefined && item.badge > 0 && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-color)]">
                                    {item.badge}
                                  </span>
                                )}
                              </>
                            )}
                          </a>
                        );
                        return sidebarCollapsed ? (
                          <RailTip key={item.id} label={item.label}>
                            {btn}
                          </RailTip>
                        ) : (
                          btn
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Quick Action Button in Sidebar */}
          <div className={`${sidebarCollapsed ? 'px-2 py-2.5' : 'p-3'} border-t border-[var(--border-color)] space-y-2 shrink-0`}>
            {sidebarCollapsed ? (
              <RailTip label="Compose Post">
                <button
                  type="button"
                  onClick={onOpenNewPost}
                  aria-label="Compose Post"
                  className="w-full py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold transition flex items-center justify-center shadow-sm"
                >
                  <PlusCircle size={15} />
                </button>
              </RailTip>
            ) : (
              <button
                type="button"
                onClick={onOpenNewPost}
                className="w-full py-2 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-text)] font-semibold text-xs transition flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <PlusCircle size={14} />
                <span>Compose Post</span>
              </button>
            )}
          </div>
        </div>

        {/* User Profile in Sidebar Bottom */}
        <div className={`${sidebarCollapsed ? 'px-2 py-2.5' : 'p-3'} border-t border-[var(--border-color)] bg-[var(--bg-sidebar)] shrink-0`}>
          <div className="relative">
            {sidebarCollapsed ? (
              <RailTip label={`${user?.fullName || 'User'} — ${user?.role === 'god' ? 'Super Admin' : user?.email || ''}`}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  aria-label={`Account: ${user?.fullName || 'User'}`}
                  className="w-full flex items-center justify-center p-1.5 rounded-lg hover:bg-[var(--bg-surface)] transition"
                >
                  <div className="w-8 h-8 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center font-mono font-bold text-xs text-[var(--accent-primary)]">
                    {user?.fullName ? user.fullName[0].toUpperCase() : 'U'}
                  </div>
                </button>
              </RailTip>
            ) : (
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--bg-surface)] transition text-left"
            >
              <div className="flex items-center space-x-2.5 truncate">
                <div className="w-7 h-7 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center font-mono font-bold text-xs text-[var(--accent-primary)]">
                  {user?.fullName ? user.fullName[0].toUpperCase() : 'U'}
                </div>
                <div className="truncate">
                  <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {user?.fullName || 'User'}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                    {user?.role === 'god' ? 'Super Admin' : user?.email}
                  </div>
                </div>
              </div>
              <ChevronDown size={13} className="text-[var(--text-muted)]" />
            </button>
            )}

            {userDropdownOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setUserDropdownOpen(false)} />
                <div className="absolute left-0 bottom-full mb-2 w-56 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl p-1.5 z-50 text-xs space-y-0.5">
                  <div className="px-2.5 py-1.5 border-b border-[var(--border-color)]">
                    <div className="font-medium text-[var(--text-primary)]">{user?.fullName}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">{user?.email}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      toggleTheme();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    <span className="flex items-center gap-2">
                      {isDark ? <Sun size={13} /> : <Moon size={13} />}
                      <span>{isDark ? 'Light Theme' : 'Dark Theme'}</span>
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] capitalize">{isDark ? 'dark' : 'light'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[var(--status-error)] hover:bg-rose-500/10 transition"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* =========================================================================
          2. MAIN COLUMN — header + page content share the space right of the
          sidebar. No manual offsets: flex layout guarantees zero overlap.
         ========================================================================= */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <header className="sticky top-0 z-30 bg-[var(--bg-sidebar)] border-b border-[var(--border-color)] h-14 w-full flex items-center justify-between px-4 sm:px-6">
        {/* Left: Mobile hamburger & Current Page Breadcrumb */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-[var(--text-muted)] hidden sm:inline">PUBLORA</span>
            <span className="text-[var(--text-muted)] hidden sm:inline">/</span>
            <span className="font-semibold text-[var(--text-primary)]">{currentTabLabel}</span>
          </div>
        </div>

        {/* Right: Search, Autopilot status, Theme toggle, Brand Selector */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {/* Active Brand selector dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setBrandDropdownOpen(!brandDropdownOpen)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition max-w-[130px] sm:max-w-[160px] truncate"
            >
              {activeBrand?.logoUrl || activeBrand?.avatarUrl ? (
                <img src={activeBrand.logoUrl || activeBrand.avatarUrl} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
              ) : (
                <span
                  className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-[var(--text-primary)] flex-shrink-0"
                  style={{ backgroundColor: activeBrand?.color || '#00D6B2' }}
                >
                  {(activeBrand?.name || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{activeBrand ? activeBrand.name : 'Select Brand'}</span>
              <ChevronDown size={12} className="text-[var(--text-muted)] flex-shrink-0" />
            </button>

            {brandDropdownOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setBrandDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl p-1.5 z-50 text-xs space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Channels / Brands
                  </div>
                  {brands.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setActiveBrandId(b.id);
                        setBrandDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition ${
                        activeBrandId === b.id
                          ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)] font-medium'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {b.logoUrl || b.avatarUrl ? (
                          <img src={b.logoUrl || b.avatarUrl} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-[var(--text-primary)] flex-shrink-0" style={{ backgroundColor: b.color }}>
                            {b.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{b.name}</span>
                      </div>
                      {activeBrandId === b.id && <CheckCircle2 size={12} className="text-[var(--accent-primary)]" />}
                    </button>
                  ))}
                  <div className="pt-1 border-t border-[var(--border-color)] mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBrandDropdownOpen(false);
                        onOpenNewBrand();
                      }}
                      className="w-full flex items-center space-x-1.5 px-2 py-1 text-[11px] text-[var(--accent-primary)] hover:underline"
                    >
                      <PlusCircle size={12} />
                      <span>Add Brand Account</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Emergency Pause Indicator if active */}
          {autopilotConfig.emergencyPaused && (
            <button
              type="button"
              onClick={toggleEmergencyPause}
              className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-medium hover:bg-rose-500/20 transition"
              title="Autopilot paused. Click to resume."
            >
              PAUSED
            </button>
          )}

          {/* New Video Button */}
          <button
            type="button"
            onClick={onOpenNewVideo}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-medium transition"
          >
            <Database size={13} className="text-[var(--text-muted)]" />
            <span>Add Video</span>
          </button>

          {/* Profile avatar + dropdown (top-right) */}
          <ProfileMenu
            onNavigateProfile={(section) => onNavigateProfile?.(section)}
            onOpenTab={setActiveTab}
          />
        </div>
      </header>

      {/* Page content column (banners, main view, footer) */}
      {children}
      </div>

      {/* =========================================================================
          3. MOBILE RESPONSIVE SLIDE-OVER DRAWER
         ========================================================================= */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-[var(--bg-sidebar)] border-r border-[var(--border-color)] h-full flex flex-col p-4 z-50 animate-in slide-in-from-left duration-200">
            <div className="flex-1 min-h-0 flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
                <a
                  href={pathForTab('dashboard')}
                  onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); setMobileMenuOpen(false); }}
                  aria-label="Go to Dashboard"
                  className="rounded-md hover:opacity-75 transition"
                >
                  <SaaLogo size="sm" />
                </a>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto sidebar-scroll space-y-1 pr-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <a
                      key={item.id}
                      href={pathForTab(item.id)}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition ${
                        isActive
                          ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold border border-[var(--border-color)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <Icon size={16} className={isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--bg-main)] text-[var(--text-muted)]">
                          {item.badge}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border-color)] space-y-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onOpenNewPost();
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold text-xs"
              >
                Compose Post
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                }}
                className="w-full py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] flex items-center justify-center gap-2"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
                <span>{isDark ? 'Switch to Light' : 'Switch to Dark'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--status-error)] flex items-center justify-center gap-2 hover:bg-rose-500/10 transition"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
