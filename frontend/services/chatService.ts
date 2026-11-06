import { del, get, patch, post, streamPost, type SSEHandlers } from '@/lib/api';
import type { Conversation, Message } from '@/types';

export interface StreamMeta {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
  created: boolean;
}

export interface StreamCallbacks {
  onMeta?: (meta: StreamMeta) => void;
  onDelta?: (text: string) => void;
  onTitle?: (data: { conversationId: string; title: string }) => void;
  onDone?: (data: { message: Message; stopped: boolean }) => void;
  onError?: (data: { code: string; message: string; message_record?: Message }) => void;
}

function handlers(cb: StreamCallbacks): SSEHandlers {
  return {
    meta: cb.onMeta,
    delta: (d: { text: string }) => cb.onDelta?.(d.text),
    title: cb.onTitle,
    done: cb.onDone,
    error: cb.onError,
  };
}

export const chatService = {
  listConversations: (params: { cursor?: string | null; search?: string; limit?: number; archived?: boolean } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.archived) q.set('archived', 'true');
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.search) q.set('search', params.search);
    q.set('limit', String(params.limit ?? 30));
    return get<{ conversations: Conversation[]; nextCursor: string | null }>(`/api/conversations?${q}`, signal);
  },
  getConversation: (id: string, before?: string, signal?: AbortSignal) =>
    get<{ conversation: Conversation; messages: Message[]; hasMore: boolean }>(
      `/api/conversations/${id}?limit=60${before ? `&before=${before}` : ''}`,
      signal,
    ),
  createConversation: (body: { title?: string; model?: string }) => post<{ conversation: Conversation }>('/api/conversations', body),
  updateConversation: (id: string, body: Partial<Pick<Conversation, 'title' | 'model' | 'pinned' | 'archived'>>) =>
    patch<{ conversation: Conversation }>(`/api/conversations/${id}`, body),
  deleteConversation: (id: string) => del(`/api/conversations/${id}`),
  deleteAllConversations: () => del<{ deleted: number }>('/api/conversations'),
  archiveAll: () => post<{ archived: number }>('/api/conversations/archive-all'),
  listShared: () => get<{ conversations: Conversation[] }>('/api/conversations/shared'),
  revokeAllShared: () => del<{ revoked: number }>('/api/conversations/shared'),
  share: (id: string) => post<{ shareId: string }>(`/api/conversations/${id}/share`),
  unshare: (id: string) => del(`/api/conversations/${id}/share`),

  streamMessage: (
    body: { conversationId?: string; content: string; model?: string; attachments?: string[] },
    cb: StreamCallbacks,
    signal?: AbortSignal,
  ) => streamPost('/api/messages/stream', body, handlers(cb), signal),
  regenerate: (messageId: string, body: { model?: string }, cb: StreamCallbacks, signal?: AbortSignal) =>
    streamPost(`/api/messages/${messageId}/regenerate`, body, handlers(cb), signal),
  editMessage: (id: string, content: string) => patch<{ message: Message; removedIds: string[] }>(`/api/messages/${id}`, { content }),
  deleteMessage: (id: string) => del<{ removedIds: string[] }>(`/api/messages/${id}`),
  feedback: (id: string, rating: 'like' | 'dislike' | null, comment?: string) =>
    post<{ message: Message }>(`/api/messages/${id}/feedback`, { rating, ...(comment ? { comment } : {}) }),
};
