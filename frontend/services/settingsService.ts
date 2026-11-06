import { API_BASE, get, patch, post, del, ApiError, uploadWithProgress } from '@/lib/api';
import type { Preferences, User, UserSettingsResponse, UserStats } from '@/types';

export const settingsService = {
  get: () => get<UserSettingsResponse>('/api/settings'),
  updatePreferences: (prefs: Partial<Preferences>) => patch<{ preferences: Preferences; user: User }>('/api/settings', prefs),
  updateProfile: (body: { name?: string; email?: string; avatar?: string | null; currentPassword?: string }) =>
    patch<{ user: User; emailChanged: boolean }>('/api/users/me', body),
  changePassword: (currentPassword: string, newPassword: string) => patch('/api/users/me/password', { currentPassword, newPassword }),
  deleteAccount: (password: string) => del('/api/users/me', { password }),
  stats: () => get<UserStats>('/api/users/me/stats'),
  uploadAvatar: (file: File, onProgress: (pct: number) => void) => {
    const form = new FormData();
    form.append('avatar', file);
    return uploadWithProgress<{ user: User }>('/api/users/me/avatar', form, onProgress);
  },
  removeAvatar: () => del<{ user: User }>('/api/users/me/avatar'),
  setTwoFactor: (enabled: boolean, password: string) => post<{ user: User }>('/api/users/me/two-factor', { enabled, password }),
  async exportData() {
    const res = await fetch(`${API_BASE}/api/users/me/export`, { credentials: 'include' });
    if (!res.ok) throw new ApiError('Export failed', res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
