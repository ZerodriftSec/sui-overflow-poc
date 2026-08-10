'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import posthog from 'posthog-js';
import * as api from './api';
import { track } from './analytics';

interface Merchant {
  id: string;
  email: string;
  role: string;
  merchantType: 'BUSINESS' | 'INDIVIDUAL';
  businessName: string | null;
  individualName: string | null;
  orgName: string | null;
  isSuspended: boolean;
  suspendedReason: string | null;
  emailVerified: boolean;
}

interface TeamMemberInfo {
  id: string;
  email: string;
  permissions: string[];
  allAppsAccess: boolean;
  appIds: string[];
  merchantId: string;
  orgName: string | null;
}

interface AuthState {
  merchant: Merchant | null;
  teamMember: TeamMemberInfo | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateMerchant: (updates: Partial<Merchant>) => void;
  isTeamMember: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    merchant: null,
    teamMember: null,
    token: null,
    loading: true,
  });

  const tryRefresh = useCallback(async () => {
    // Try merchant refresh first
    try {
      const result = await api.refreshToken();
      const profile = await api.getProfile(result.accessToken);
      setState({ merchant: profile, teamMember: null, token: result.accessToken, loading: false });
      return;
    } catch {
      // Merchant refresh failed, try team refresh
    }

    try {
      const result = await api.teamRefreshToken();
      setState({ merchant: null, teamMember: result.member, token: result.accessToken, loading: false });
      return;
    } catch {
      // Neither worked
    }

    setState({ merchant: null, teamMember: null, token: null, loading: false });
  }, []);

  useEffect(() => {
    tryRefresh();
  }, [tryRefresh]);

  useEffect(() => {
    if (state.loading) return;

    if (state.merchant) {
      posthog.identify(`merchant:${state.merchant.id}`, {
        role: 'MERCHANT',
        email_verified: state.merchant.emailVerified,
        merchant_type: state.merchant.merchantType,
        has_org_name: Boolean(state.merchant.orgName),
      });
      return;
    }

    if (state.teamMember) {
      posthog.identify(`team:${state.teamMember.id}`, {
        role: 'TEAM_MEMBER',
        all_apps_access: state.teamMember.allAppsAccess,
      });
      return;
    }

    posthog.reset();
  }, [state.loading, state.merchant, state.teamMember]);

  const loginFn = async (email: string, password: string) => {
    track('dashboard_login_submitted');
    const result = await api.login(email, password);

    if (result.isTeamMember && result.member) {
      setState({ merchant: null, teamMember: result.member, token: result.accessToken, loading: false });
      track('dashboard_login_succeeded', { actor_type: 'team_member' });
    } else {
      setState({ merchant: result.merchant, teamMember: null, token: result.accessToken, loading: false });
      track('dashboard_login_succeeded', { actor_type: 'merchant' });
    }
  };

  const registerFn = async (email: string, password: string) => {
    track('dashboard_register_submitted');
    const result = await api.register(email, password);
    setState({ merchant: result.merchant, teamMember: null, token: result.accessToken, loading: false });
    track('dashboard_register_succeeded');
  };

  const logoutFn = async () => {
    if (state.teamMember) {
      await api.teamLogout();
    } else {
      await api.logout();
    }
    setState({ merchant: null, teamMember: null, token: null, loading: false });
    track('dashboard_logout_succeeded');
  };

  const updateMerchant = (updates: Partial<Merchant>) => {
    setState((s) => ({
      ...s,
      merchant: s.merchant ? { ...s.merchant, ...updates } : null,
    }));
  };

  const isTeamMember = !!state.teamMember;

  return (
    <AuthContext.Provider
      value={{ ...state, login: loginFn, register: registerFn, logout: logoutFn, updateMerchant, isTeamMember }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

/**
 * Check if the current user has a specific permission.
 * Merchant owners always have all permissions.
 * Team members are checked against their permissions array.
 * MANAGE implies VIEW (e.g. PAYOUTS_MANAGE satisfies PAYOUTS_VIEW).
 */
export function usePermission() {
  const { merchant, teamMember } = useAuth();

  return useCallback(
    (...requiredPermissions: string[]): boolean => {
      // Merchant owner — full access
      if (merchant && !teamMember) return true;
      // Not authenticated
      if (!teamMember) return false;

      const perms = teamMember.permissions;
      return requiredPermissions.every((p) => {
        if (perms.includes(p)) return true;
        // MANAGE implies VIEW
        if (p.endsWith('_VIEW')) {
          return perms.includes(p.replace(/_VIEW$/, '_MANAGE'));
        }
        return false;
      });
    },
    [merchant, teamMember],
  );
}

/**
 * Check if team member has access to a specific app.
 * Merchant owners always have access to all apps.
 */
export function useAppAccess() {
  const { merchant, teamMember } = useAuth();

  return useCallback(
    (appId: string): boolean => {
      if (merchant && !teamMember) return true;
      if (!teamMember) return false;
      if (teamMember.allAppsAccess) return true;
      return teamMember.appIds.includes(appId);
    },
    [merchant, teamMember],
  );
}
