'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { refreshSession } from '@/lib/api';
import type { AuthConfig, LoginChallenge, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  config: AuthConfig | null;
  loading: boolean;
  /** Resolves to the user, or to a challenge when an emailed sign-in code is required. */
  login: (email: string, password: string) => Promise<User | LoginChallenge>;
  verifyLogin: (challengeToken: string, code: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const router = useRouter();
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const refreshUser = useCallback(async () => {
    try {
      // Never 401s, so signed-out visitors don't see console errors; also renews expired tokens.
      setUser((await authService.session()).user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
    authService
      .config()
      .then(setConfig)
      .catch(() => undefined);
  }, [refreshUser]);

  useEffect(() => {
    // Only a previously signed-in user can have an "expired" session; anonymous 401s are normal.
    const onExpired = () => {
      if (!userRef.current) return;
      setUser(null);
      router.replace('/login?expired=1');
    };
    window.addEventListener('kairo:session-expired', onExpired);
    return () => window.removeEventListener('kairo:session-expired', onExpired);
  }, [router]);

  // Keep the session alive in long-lived tabs: refresh a little before the access token expires.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => void refreshSession(), 12 * 60 * 1000);
    return () => clearInterval(id);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authService.login(email, password);
    if ('twoFactorRequired' in res) return res;
    setUser(res.user);
    return res.user;
  }, []);

  const verifyLogin = useCallback(async (challengeToken: string, code: string) => {
    const { user } = await authService.loginVerify(challengeToken, code);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { user } = await authService.register(name, email, password);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo(
    () => ({ user, config, loading, login, verifyLogin, register, logout, refreshUser, setUser }),
    [user, config, loading, login, verifyLogin, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
