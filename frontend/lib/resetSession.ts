/**
 * Holds the one-time reset token between the "enter code" and "new password" steps.
 * sessionStorage keeps it out of URLs, history and referrers, and it dies with the tab.
 */
const KEY = 'kairo:reset';

export function saveResetSession(data: { token: string; email: string; expiresAt: number }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
}

export function readResetSession(): { token: string; email: string; expiresAt: number } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.token || Date.now() > data.expiresAt) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearResetSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
