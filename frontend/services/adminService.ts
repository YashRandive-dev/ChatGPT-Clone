import { del, get, patch } from '@/lib/api';
import type { AdminUser, AppSettings, Conversation, Paginated, User } from '@/types';

export interface DashboardResponse {
  stats: {
    totalUsers: number;
    activeUsers24h: number;
    activeUsers7d: number;
    blockedUsers: number;
    newUsers7d: number;
    totalConversations: number;
    totalMessages: number;
    messages24h: number;
    aiRequests: number;
    aiErrors: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    aiRequests30d: number;
    tokens30d: number;
    likes: number;
    dislikes: number;
  };
  daily: { date: string; requests: number; tokens: number }[];
  providers: { name: string; configured: boolean }[];
}

export interface UsageResponse {
  days: number;
  daily: { date: string; requests: number; tokens: number }[];
  byModel: { model: string; requests: number; tokens: number; promptTokens: number; completionTokens: number; errors: number; avgLatencyMs: number }[];
  topUsers: { userId: string; name: string; email: string; requests: number; tokens: number }[];
}

export interface AdminConversation extends Conversation {
  user: { id: string; name: string; email: string } | null;
}

export interface FeedbackItem {
  id: string;
  rating: 'like' | 'dislike';
  comment: string | null;
  model: string | null;
  createdAt: string;
  conversationId: string;
  user: { id: string; name: string; email: string } | null;
  excerpt: string | null;
}

export const adminService = {
  dashboardKey: '/api/admin/dashboard',
  usersKey: (q: { search?: string; page: number; role?: string; status?: string }) => {
    const p = new URLSearchParams({ page: String(q.page), limit: '20' });
    if (q.search) p.set('search', q.search);
    if (q.role) p.set('role', q.role);
    if (q.status) p.set('status', q.status);
    return `/api/admin/users?${p}`;
  },
  updateUser: (id: string, body: Partial<Pick<User, 'blocked' | 'role' | 'emailVerified'>>) => patch<{ user: User }>(`/api/admin/users/${id}`, body),
  deleteUser: (id: string) => del(`/api/admin/users/${id}`),
  conversationsKey: (q: { page: number; search?: string }) => {
    const p = new URLSearchParams({ page: String(q.page), limit: '20' });
    if (q.search) p.set('search', q.search);
    return `/api/admin/conversations?${p}`;
  },
  getConversation: (id: string) =>
    get<{ conversation: Conversation; messages: { id: string; role: string; content: string; createdAt: string; model: string | null }[] }>(
      `/api/admin/conversations/${id}`,
    ),
  settingsKey: '/api/admin/settings',
  updateSettings: (body: Partial<AppSettings>) => patch<{ settings: AppSettings }>('/api/admin/settings', body as Record<string, unknown>),
  usageKey: (days: number) => `/api/admin/usage?days=${days}`,
  feedbackKey: (q: { page: number; rating?: string }) => `/api/admin/feedback?page=${q.page}&limit=20${q.rating ? `&rating=${q.rating}` : ''}`,
};

export type UsersResponse = Paginated & { users: AdminUser[] };
export type AdminConversationsResponse = Paginated & { conversations: AdminConversation[]; contentAccess: boolean };
export type FeedbackResponse = Paginated & { feedback: FeedbackItem[] };
