import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, Workspace, WorkspaceSettings, PlanTier, BillingCycle, UserPreferences } from '../types';
import { apiFetch } from '../lib/api';

interface AuthContextType {
  user: User | null;
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  memberRole: string | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; verificationToken?: string; error?: string }>;
  demoLogin: (role?: 'creator' | 'admin') => Promise<{ success: boolean; error?: string }>;
  socialLogin: (provider: 'google' | 'github' | 'apple', details?: { email?: string; fullName?: string; avatarUrl?: string }) => Promise<{ success: boolean; error?: string }>;
  sendMagicLink: (email: string) => Promise<{ success: boolean; testOtpHint?: string; error?: string }>;
  verifyMagicLink: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  passkeyLogin: (email?: string) => Promise<{ success: boolean; error?: string }>;
  ssoLogin: (companyDomain: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; testTokenHint?: string; error?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: {
    fullName?: string;
    avatarUrl?: string;
    username?: string;
    phone?: string;
    bio?: string;
    country?: string;
    city?: string;
    timezone?: string;
    language?: 'en' | 'ar';
    dateFormat?: string;
    timeFormat?: '12h' | '24h';
    email?: string;
    preferences?: UserPreferences;
  }) => Promise<{ success: boolean; error?: string; emailChangePending?: boolean; emailChangeToken?: string }>;
  updateWorkspaceSettings: (settings: Partial<WorkspaceSettings>) => Promise<{ success: boolean; error?: string }>;
  switchWorkspace: (workspaceId: string) => void;
  createWorkspace: (name: string) => Promise<{ success: boolean; workspace?: Workspace; error?: string }>;
  upgradePlan: (plan: PlanTier, billingCycle?: BillingCycle) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (password: string) => Promise<{ success: boolean; error?: string }>;
  verifyEmailChange: (token: string) => Promise<{ success: boolean; error?: string }>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const WS_STORAGE_KEY = 'sra_active_workspace_id';
// Session auth is cookie-based (HttpOnly). `sessionToken` remains in context
// only as a truthy sentinel so existing `!sessionToken` guards keep working —
// its value is never a usable credential.
const COOKIE_SESSION = 'cookie';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Marks a fresh interactive login (not page refresh / session restore) so the
  // app shell can play its entrance transition exactly once.
  const authBootedRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (!authBootedRef.current) {
      authBootedRef.current = true;
      wasAuthenticatedRef.current = !!user;
      return;
    }
    if (!wasAuthenticatedRef.current && user) {
      try { sessionStorage.setItem('publora_auth_transition', '1'); } catch {}
    }
    wasAuthenticatedRef.current = !!user;
  }, [isLoading, user]);

  // Helper for authenticated fetch — the HttpOnly session cookie is sent
  // automatically (credentials: 'include' in apiFetch); no Bearer token.
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    const wsId = activeWorkspace?.id || localStorage.getItem(WS_STORAGE_KEY);
    if (wsId) {
      headers.set('x-workspace-id', wsId);
    }
    return apiFetch(url, {
      ...options,
      headers,
    });
  };

  const refreshAuth = async () => {
    // No client-side token check — the cookie decides. Always probe /me.
    try {
      const res = await authFetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        setSessionToken(COOKIE_SESSION);
        setUser(data.user);
        setWorkspaces(data.workspaces || []);
        setMemberRole(data.memberRole || null);
        const savedWsId = localStorage.getItem(WS_STORAGE_KEY);
        const matchingWs = data.workspaces?.find((w: Workspace) => w.id === savedWsId);
        setActiveWorkspace(matchingWs || data.workspace || data.workspaces?.[0] || null);
      } else {
        setSessionToken(null);
        setUser(null);
        setActiveWorkspace(null);
        setWorkspaces([]);
      }
    } catch (e) {
      console.error('Session validation error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Purge the legacy localStorage session token if one exists.
    try { localStorage.removeItem('sra_session_token'); } catch {}
    refreshAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setSessionToken(COOKIE_SESSION);
        setUser(data.user);
        setWorkspaces(data.workspaces || []);
        setActiveWorkspace(data.workspace || null);
        if (data.workspace?.id) {
          localStorage.setItem(WS_STORAGE_KEY, data.workspace.id);
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Invalid credentials' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Login request failed' };
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setSessionToken(COOKIE_SESSION);
        setUser(data.user);
        setWorkspaces(data.workspaces || []);
        setActiveWorkspace(data.workspace || null);
        if (data.workspace?.id) {
          localStorage.setItem(WS_STORAGE_KEY, data.workspace.id);
        }
        return { success: true, verificationToken: data.verificationToken };
      }
      return { success: false, error: data.error || 'Registration failed' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Registration request failed' };
    }
  };

  // Disabled auth methods — the backend endpoints were removed (security
  // remediation T0.2). Real social/passkey/SSO login returns in Phase E.
  const unavailableAuth = async () =>
    ({ success: false, error: 'This sign-in method is not available yet.' });

  const demoLogin = unavailableAuth;

  const socialLogin = async (
    _provider: 'google' | 'github' | 'apple',
    _details?: { email?: string; fullName?: string; avatarUrl?: string }
  ) => unavailableAuth();

  const sendMagicLink = async (email: string) => {
    try {
      const res = await apiFetch('/api/auth/magic-link/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return { success: data.success, testOtpHint: data.testOtpHint, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const verifyMagicLink = async (email: string, code: string) => {
    try {
      const res = await apiFetch('/api/auth/magic-link/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setSessionToken(COOKIE_SESSION);
        setUser(data.user);
        setWorkspaces(data.workspaces || []);
        setActiveWorkspace(data.workspace || null);
        if (data.workspace?.id) {
          localStorage.setItem(WS_STORAGE_KEY, data.workspace.id);
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Magic code verification failed' };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const passkeyLogin = async (_email?: string) => unavailableAuth();

  const ssoLogin = async (_companyDomain: string, _email?: string) => unavailableAuth();

  const logout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem(WS_STORAGE_KEY);
    setSessionToken(null);
    setUser(null);
    setActiveWorkspace(null);
    setWorkspaces([]);
  };

  const verifyEmail = async (token: string) => {
    try {
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        if (user) {
          setUser({ ...user, isEmailVerified: true });
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Verification failed' };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return { success: data.success, testTokenHint: data.testTokenHint, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      return { success: data.success, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      return { success: data.success, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const updateProfile = async (data: {
    fullName?: string;
    avatarUrl?: string;
    username?: string;
    phone?: string;
    bio?: string;
    country?: string;
    city?: string;
    timezone?: string;
    language?: 'en' | 'ar';
    dateFormat?: string;
    timeFormat?: '12h' | '24h';
    email?: string;
    preferences?: UserPreferences;
  }) => {
    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (resData.success && resData.user) {
        setUser(resData.user);
        return {
          success: true,
          emailChangePending: resData.emailChangePending,
          emailChangeToken: resData.emailChangeToken,
        };
      }
      return { success: false, error: resData.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const verifyEmailChange = async (token: string) => {
    try {
      const res = await apiFetch('/api/auth/verify-email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshAuth();
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const updateWorkspaceSettings = async (settings: Partial<WorkspaceSettings>) => {
    if (!activeWorkspace) return { success: false, error: 'No active workspace' };
    try {
      const res = await authFetch(`/api/saas/workspace/${activeWorkspace.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (data.success && data.workspace) {
        setActiveWorkspace(data.workspace);
        setWorkspaces(workspaces.map((w) => (w.id === data.workspace.id ? data.workspace : w)));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const switchWorkspace = (workspaceId: string) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (ws) {
      setActiveWorkspace(ws);
      localStorage.setItem(WS_STORAGE_KEY, ws.id);
    }
  };

  const createWorkspace = async (name: string) => {
    try {
      const res = await authFetch('/api/saas/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success && data.workspace) {
        setActiveWorkspace(data.workspace);
        setWorkspaces(data.workspaces || [...workspaces, data.workspace]);
        localStorage.setItem(WS_STORAGE_KEY, data.workspace.id);
        return { success: true, workspace: data.workspace };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const upgradePlan = async (plan: PlanTier, billingCycle: BillingCycle = 'monthly') => {
    try {
      const res = await authFetch('/api/saas/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle }),
      });
      const data = await res.json();
      if (data.success && data.workspace) {
        setActiveWorkspace(data.workspace);
        setWorkspaces(workspaces.map((w) => (w.id === data.workspace.id ? data.workspace : w)));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const deleteAccount = async (password: string) => {
    try {
      const res = await authFetch('/api/saas/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        await logout();
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeWorkspace,
        workspaces,
        memberRole,
        sessionToken,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        demoLogin,
        socialLogin,
        sendMagicLink,
        verifyMagicLink,
        passkeyLogin,
        ssoLogin,
        logout,
        verifyEmail,
        requestPasswordReset,
        resetPassword,
        changePassword,
        updateProfile,
        updateWorkspaceSettings,
        switchWorkspace,
        createWorkspace,
        upgradePlan,
        deleteAccount,
        verifyEmailChange,
        apiFetch: authFetch,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};