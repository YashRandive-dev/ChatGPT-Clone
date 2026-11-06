import { api, get, post, del } from '@/lib/api';
import type { AuthConfig, LoginChallenge, Session, User } from '@/types';

export interface OtpTiming {
  expiresInSeconds: number;
  resendInSeconds: number;
}

let sessionPromise: Promise<{ user: User | null }> | null = null;
let configPromise: Promise<AuthConfig> | null = null;

export const authService = {
  me: () => api<{ user: User }>('/api/auth/me'),
  /** Single-flight: concurrent callers (e.g. React dev double-effects) share one request. */
  session: () => {
    sessionPromise ??= api<{ user: User | null }>('/api/auth/session', { noRefresh: true }).finally(() => {
      setTimeout(() => (sessionPromise = null), 0);
    });
    return sessionPromise;
  },
  /** Returns the user, or a challenge when two-step verification is enabled. */
  login: (email: string, password: string) =>
    api<{ user: User } | LoginChallenge>('/api/auth/login', { method: 'POST', body: { email, password }, noRefresh: true }),
  loginVerify: (challengeToken: string, code: string) =>
    api<{ user: User }>('/api/auth/login/verify', { method: 'POST', body: { challengeToken, code }, noRefresh: true }),
  loginResend: (challengeToken: string) =>
    api<OtpTiming>('/api/auth/login/resend', { method: 'POST', body: { challengeToken }, noRefresh: true }),
  /** Public auth settings; fetched once per page load and cached. */
  config: () => {
    configPromise ??= api<AuthConfig>('/api/auth/config', { noRefresh: true }).catch((err) => {
      configPromise = null;
      throw err;
    });
    return configPromise;
  },
  register: (name: string, email: string, password: string) =>
    api<{ user: User; verification: OtpTiming }>('/api/auth/register', { method: 'POST', body: { name, email, password }, noRefresh: true }),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST', noRefresh: true }),
  /** Step 1 – email a 6-digit reset code. */
  forgotPassword: (email: string) => post<{ message: string } & OtpTiming>('/api/auth/forgot-password', { email }),
  /** Step 2 – exchange the code for a one-time reset token. */
  verifyResetCode: (email: string, code: string) => post<{ resetToken: string; expiresInSeconds: number }>('/api/auth/verify-reset-code', { email, code }),
  /** Step 3 – set the new password. */
  resetPassword: (token: string, password: string) => post<{ message: string }>('/api/auth/reset-password', { token, password }),
  verifyEmail: (code: string) => post<{ user: User }>('/api/auth/verify-email', { code }),
  resendVerification: () => post<{ message: string } & Partial<OtpTiming>>('/api/auth/resend-verification'),
  sessions: () => get<{ sessions: Session[] }>('/api/auth/sessions'),
  revokeSession: (id: string) => del(`/api/auth/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: () => del('/api/auth/sessions'),
};
