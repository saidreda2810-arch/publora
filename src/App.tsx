import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublisherProvider, usePublisher } from './context/PublisherContext';
import { Navbar } from './components/Navbar';
import { pathForTab, tabFromPath } from './lib/routes';
import { DashboardView } from './components/DashboardView';
import { RetentionIntelligenceView } from './components/RetentionIntelligenceView';
import { ContentIntelligenceView } from './components/ContentIntelligenceView';
import { PublishingTimeOptimizerView } from './components/PublishingTimeOptimizerView';
import { AutopilotControlCenterView } from './components/AutopilotControlCenterView';
import { ExperimentManagerView } from './components/ExperimentManagerView';
import { VideoLibraryView } from './components/VideoLibraryView';
import { PublishingQueueView } from './components/PublishingQueueView';
import { BrandAccountManagerView } from './components/BrandAccountManagerView';
import { BrandDetailView } from './components/BrandDetailView';
import { MetricAvailabilityView } from './components/MetricAvailabilityView';
import { SocialConnectionCenterView } from './components/SocialConnectionCenterView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AIVideoStudioView } from './components/AIVideoStudioView';
import { PublishingCalendarView } from './components/PublishingCalendarView';
import { AutomationsView } from './components/AutomationsView';
import { AIStrategistView } from './components/AIStrategistView';
import { TeamWorkspaceView } from './components/TeamWorkspaceView';
import { ReportsView } from './components/ReportsView';
import { GoogleDriveView } from './components/GoogleDriveView';
import { PublicLandingView } from './components/public/PublicLandingView';
import { ProfilePage } from './components/profile/ProfilePage';
import { OnboardingModal } from './components/OnboardingModal';
import { LoginIntro } from './components/LoginIntro';
import { ComposePostModal, NewBrandModal } from './components/Modals';
import { AddVideoWizard } from './components/AddVideoWizard';
import { ArrowRight, X, AlertTriangle } from 'lucide-react';
import { testFirebaseConnection } from './utils/firebase';
import { apiFetch } from './lib/api';
import { usePageTitle } from './lib/pageTitles';

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading, activeWorkspace, updateWorkspaceSettings } = useAuth();
  const { remoteSyncError } = usePublisher();
  const [activeTab, setActiveTab] = useState(() => tabFromPath(window.location.pathname));
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [composeVideoId, setComposeVideoId] = useState<string | undefined>(undefined);
  const [composeScheduledTime, setComposeScheduledTime] = useState<string | undefined>(undefined);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [profileSection, setProfileSection] = useState<string | undefined>(undefined);
  usePageTitle(activeTab === 'profile' && profileSection ? `profile:${profileSection}` : activeTab);
  const [entranceAnim, setEntranceAnim] = useState(false);
  const landingAppliedRef = React.useRef(false);

  // Collapsible sidebar — persisted per-browser
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('publora_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('publora_sidebar_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  // Play the app-shell entrance once after a fresh interactive
  // login. The flag is set by AuthContext and consumed here — refresh/direct
  // nav skip it. Reduced-motion users go straight to the dashboard.
  React.useEffect(() => {
    if (!isAuthenticated) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem('publora_auth_transition') === '1';
      if (flagged) sessionStorage.removeItem('publora_auth_transition');
    } catch {}
    if (!flagged) return;
    setEntranceAnim(true);
    const t = setTimeout(() => setEntranceAnim(false), 1400);
    return () => clearTimeout(t);
  }, [isAuthenticated]);

  const [publicConfig, setPublicConfig] = useState<any>(null);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  React.useEffect(() => {
    testFirebaseConnection().catch((e) => console.warn('Firebase init check:', e));
    apiFetch('/api/system/public-config')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPublicConfig(data);
        }
      })
      .catch(() => {});
  }, []);

  // URL ⇄ tab sync: back/forward, refresh, and direct URL access all work
  React.useEffect(() => {
    const syncFromUrl = () => setActiveTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  React.useEffect(() => {
    const path = pathForTab(activeTab);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }, [activeTab]);

  // Apply per-user default landing page preference once after auth resolves
  React.useEffect(() => {
    if (landingAppliedRef.current || !user) return;
    landingAppliedRef.current = true;
    const landing = user.preferences?.defaultLanding;
    if (landing && landing !== 'dashboard') {
      setActiveTab(landing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const navigateToProfile = (section?: string) => {
    setProfileSection(section);
    setActiveTab('profile');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex flex-col items-center justify-center text-[var(--text-primary)]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center font-mono font-bold text-xs text-[var(--accent-primary)] animate-pulse">
            PUBLORA
          </div>
          <p className="text-xs font-mono text-[var(--text-muted)]">Initializing workspace...</p>
        </div>
      </div>
    );
  }

  // If not logged in and not in sandbox test drive, show the public landing view
  if (!isAuthenticated && !isSandboxMode) {
    return <PublicLandingView onEnterSandbox={() => setIsSandboxMode(true)} />;
  }

  // Needs onboarding wizard
  const showOnboarding = Boolean(
    isAuthenticated &&
    activeWorkspace &&
    activeWorkspace.settings?.onboardingCompleted === false
  );

  return (
    <div className={`min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col font-sans selection:bg-[var(--accent-primary)] selection:text-[var(--accent-primary-text)] w-full ${entranceAnim ? 'app-entrance' : ''}`}>
      {/* App shell: sidebar column + content column (header, notices, main, footer) */}
      <div className="flex flex-1 min-h-0">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewPost={() => setIsPostModalOpen(true)}
        onOpenNewVideo={() => setIsVideoModalOpen(true)}
        onOpenNewBrand={() => setIsBrandModalOpen(true)}
        onNavigateProfile={navigateToProfile}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      >
      {/* Maintenance Mode Notice for Super Admins / Platform Admin */}
      {publicConfig?.maintenanceMode && (
        <div className="bg-amber-950/70 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs flex items-center justify-between z-40 sticky top-14">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="font-semibold text-white">MAINTENANCE MODE:</span>
            <span>{publicConfig.maintenanceMessage}</span>
          </div>
          <button
            onClick={() => setActiveTab('admin')}
            className="text-[11px] font-medium text-amber-300 underline hover:text-white"
          >
            Console →
          </button>
        </div>
      )}

      {/* Remote workspace sync failure/conflict notice */}
      {isAuthenticated && remoteSyncError && (
        <div className="bg-rose-950/70 border-b border-rose-500/30 text-rose-200 px-4 py-2 text-xs flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-400" />
            <span>{remoteSyncError}</span>
          </div>
        </div>
      )}

      {/* Broadcast Announcements */}
      {publicConfig?.announcements?.map((ann: any) => {
        if (dismissedAnnouncements.includes(ann.id)) return null;
        return (
          <div
            key={ann.id}
            className={`border-b px-4 py-2 text-xs flex items-center justify-between z-40 ${
              ann.type === 'alert'
                ? 'bg-rose-950/70 border-rose-500/30 text-rose-200'
                : ann.type === 'warning'
                ? 'bg-amber-950/70 border-amber-500/30 text-amber-200'
                : 'bg-[var(--bg-surface)] border-[var(--border-color)] text-[var(--text-secondary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {ann.type}
              </span>
              <strong className="text-[var(--text-primary)] font-medium">{ann.title}:</strong>
              <span>{ann.message}</span>
            </div>
            <button
              onClick={() => setDismissedAnnouncements([...dismissedAnnouncements, ann.id])}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-4"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      {/* Sandbox Notice Banner if test driving without account */}
      {!isAuthenticated && isSandboxMode && (
        <div className="bg-[var(--bg-surface)] border-b border-[var(--border-color)] px-4 py-2 text-xs flex items-center justify-between z-40 sticky top-14">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)]">Interactive Sandbox Mode</span>
            <span className="hidden sm:inline text-[var(--text-muted)]">Â· Explore media operations with benchmark assets</span>
          </div>
          <button
            type="button"
            onClick={() => setIsSandboxMode(false)}
            className="py-1 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-text)] font-semibold text-xs flex items-center gap-1"
          >
            Exit Sandbox <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Main View Router */}
      <main className="flex-1 w-full min-w-0 pb-12 sm:pb-16 bg-[var(--bg-main)]">
        {activeTab === 'dashboard' && (
          <DashboardView
            animateEntrance={entranceAnim}
            setActiveTab={setActiveTab}
            onOpenNewPost={() => setIsPostModalOpen(true)}
            onOpenNewVideo={() => setIsVideoModalOpen(true)}
          />
        )}
        {activeTab === 'connections' && <SocialConnectionCenterView />}
        {activeTab === 'drive' && (
          <GoogleDriveView
            setActiveTab={setActiveTab}
            onOpenNewPost={() => setIsPostModalOpen(true)}
          />
        )}
        {activeTab === 'aistudio' && <AIVideoStudioView setActiveTab={setActiveTab} />}
        {activeTab === 'calendar' && (
          <PublishingCalendarView
          onOpenNewPost={() => setIsPostModalOpen(true)}
          onScheduleAt={(iso) => { setComposeScheduledTime(iso); setIsPostModalOpen(true); }}
          setActiveTab={setActiveTab}
        />
        )}
        {activeTab === 'automations' && <AutomationsView />}
        {activeTab === 'strategist' && (
          <AIStrategistView setActiveTab={setActiveTab} />
        )}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'team' && <TeamWorkspaceView />}
        {activeTab === 'retention' && <RetentionIntelligenceView />}
        {activeTab === 'content' && <ContentIntelligenceView />}
        {activeTab === 'timing' && <PublishingTimeOptimizerView />}
        {activeTab === 'autopilot' && <AutopilotControlCenterView />}
        {activeTab === 'experiments' && <ExperimentManagerView />}
        {activeTab === 'videos' && (
          <VideoLibraryView
            onOpenNewVideo={() => setIsVideoModalOpen(true)}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'queue' && (
          <PublishingQueueView onOpenNewPost={() => setIsPostModalOpen(true)} />
        )}
        {activeTab === 'branddetail' && <BrandDetailView setActiveTab={setActiveTab} />}
        {activeTab === 'brands' && (
          <BrandAccountManagerView
            onOpenNewBrand={() => setIsBrandModalOpen(true)}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'matrix' && <MetricAvailabilityView />}
        {activeTab === 'admin' && <AdminDashboardView />}
        {activeTab === 'profile' && (
          <ProfilePage
            initialSection={profileSection}
            onOpenTab={setActiveTab}
            onOpenNewBrand={() => setIsBrandModalOpen(true)}
            onBack={() => setActiveTab('dashboard')}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-color)] py-4 bg-[var(--bg-sidebar)] text-xs text-[var(--text-muted)] w-full">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-semibold text-[var(--text-secondary)] font-mono">PUBLORA</span>
            <span aria-hidden="true">Â·</span>
            <span>Media Operations & Publishing Platform</span>
            {activeWorkspace && (
              <>
                <span aria-hidden="true">Â·</span>
                <span className="text-[var(--text-secondary)] font-mono">{activeWorkspace.name}</span>
              </>
            )}
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)]">
            Production Enterprise Engine
          </div>
        </div>
      </footer>
      </Navbar>
      </div>

      {/* Modals */}
      <ComposePostModal
        isOpen={isPostModalOpen}
        onClose={() => { setIsPostModalOpen(false); setComposeVideoId(undefined); }}
        initialVideoId={composeVideoId}
        initialScheduledTime={composeScheduledTime}
      />
      <AddVideoWizard
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        onContinueToPost={(videoId) => {
          setComposeVideoId(videoId);
          setIsPostModalOpen(true);
        }}
        onGoToConnections={() => {
          setIsVideoModalOpen(false);
          setActiveTab('connections');
        }}
        onCreateBrand={() => {
          setIsVideoModalOpen(false);
          setIsBrandModalOpen(true);
        }}
      />
      <NewBrandModal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
      />
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => updateWorkspaceSettings({ onboardingCompleted: true })}
        onNavigateTab={(tab) => {
          updateWorkspaceSettings({ onboardingCompleted: true });
          setActiveTab(tab);
        }}
        onNewVideo={() => {
          updateWorkspaceSettings({ onboardingCompleted: true });
          setIsVideoModalOpen(true);
        }}
        onNewPost={() => {
          updateWorkspaceSettings({ onboardingCompleted: true });
          setIsPostModalOpen(true);
        }}
      />
    </div>
  );
};

export function App() {
  // Brand splash: plays the Publora intro once before the app/landing is
  // revealed. Skipped entirely for reduced-motion users.
  // Temporarily deactivated — set SPLASH_ENABLED to true to restore.
  const SPLASH_ENABLED = false;
  const [splashDone, setSplashDone] = useState(
    () =>
      !SPLASH_ENABLED ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
  const [revealAnim, setRevealAnim] = useState(false);

  const handleSplashDone = () => {
    setSplashDone(true);
    setRevealAnim(true);
    setTimeout(() => setRevealAnim(false), 800);
  };

  return (
    <ThemeProvider>
      {!splashDone && <LoginIntro onDone={handleSplashDone} />}
      <AuthProvider>
        <PublisherProvider>
          <div className={revealAnim ? 'splash-app-in' : undefined}>
            <AppContent />
          </div>
        </PublisherProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;