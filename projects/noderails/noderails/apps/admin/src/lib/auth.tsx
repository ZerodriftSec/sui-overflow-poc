'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import posthog from 'posthog-js';
import * as api from './api';
import { track } from './analytics';

interface AdminState {
  admin: { email: string; role: string } | null;
  token: string | null;
  loading: boolean;
}

interface AdminAuthContextValue extends AdminState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>({
    admin: null,
    token: null,
    loading: true,
  });

  // On mount, try to refresh via HttpOnly cookie
  const tryRefresh = useCallback(async () => {
    try {
      const result = await api.adminRefresh();
      setState({ admin: result.admin, token: result.accessToken, loading: false });
    } catch {
      setState({ admin: null, token: null, loading: false });
    }
  }, []);

  useEffect(() => {
    tryRefresh();
  }, [tryRefresh]);

  useEffect(() => {
    if (state.loading) return;

    if (state.admin) {
      posthog.identify(`admin:${state.admin.email.toLowerCase()}`, {
        role: state.admin.role,
      });
      return;
    }

    posthog.reset();
  }, [state.loading, state.admin]);

  const login = async (email: string, password: string) => {
    track('admin_login_submitted');
    const result = await api.adminLogin(email, password);
    setState({ admin: result.admin, token: result.accessToken, loading: false });
    track('admin_login_succeeded');
  };

  const logout = async () => {
    await api.adminLogout();
    setState({ admin: null, token: null, loading: false });
    track('admin_logout_succeeded');
  };

  return (
    <AdminAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be inside AdminAuthProvider');
  return ctx;
}
