import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';

vi.mock('@/services/chatService', () => ({ chatService: { streamMessage: vi.fn(), regenerate: vi.fn(), feedback: vi.fn() } }));

import { chatService } from '@/services/chatService';
import { getChatState, NEW_THREAD, rateMessage, resetChatStore, sendMessage, stopGenerating } from '@/lib/chatStore';
import { ApiError } from '@/lib/api';

const msg = (over: Partial<Message>): Message => ({
  id: 'm',
  conversationId: 'c1',
  role: 'user',
  content: '',
  attachments: [],
  feedback: null,
  tokenUsage: null,
  model: null,
  status: 'complete',
  error: null,
  editedAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});
const conversation = { id: 'c1', title: 'Hello', model: 'm', pinned: false, archived: false, shared: false, shareId: null, messageCount: 2, lastMessageAt: '', createdAt: '', updatedAt: new Date().toISOString() };

describe('chat store (mocked streaming provider)', () => {
  beforeEach(() => {
    resetChatStore();
    vi.mocked(chatService.streamMessage).mockReset();
  });

  it('streams a new conversation: optimistic messages, deltas, title and done', async () => {
    vi.mocked(chatService.streamMessage).mockImplementation(async (_body, cb) => {
      cb.onMeta?.({ conversation, created: true, userMessage: msg({ id: 'u1', content: 'Hi' }), assistantMessage: msg({ id: 'a1', role: 'assistant', status: 'streaming' }) });
      cb.onDelta?.('Hel');
      cb.onDelta?.('lo!');
      cb.onTitle?.({ conversationId: 'c1', title: 'Greeting' });
      cb.onDone?.({ message: msg({ id: 'a1', role: 'assistant', content: 'Hello!' }), stopped: false });
    });
    const onCreated = vi.fn();
    const res = await sendMessage({ threadKey: NEW_THREAD, content: 'Hi', attachments: [], onCreated });
    expect(res.ok).toBe(true);
    expect(onCreated).toHaveBeenCalledWith('c1');
    const s = getChatState();
    expect(s.threads[NEW_THREAD]).toBeUndefined();
    expect(s.threads.c1!.messages.map((m) => [m.id, m.content])).toEqual([
      ['u1', 'Hi'],
      ['a1', 'Hello!'],
    ]);
    expect(s.conversations[0]!.title).toBe('Greeting');
    expect(s.streaming).toEqual({});
  });

  it('rolls back optimistic messages when the request fails before streaming', async () => {
    vi.mocked(chatService.streamMessage).mockRejectedValue(new ApiError('Daily limit reached', 429, 'USAGE_LIMIT'));
    const res = await sendMessage({ threadKey: NEW_THREAD, content: 'Hi', attachments: [] });
    expect(res).toEqual({ ok: false, error: 'Daily limit reached' });
    expect(getChatState().threads[NEW_THREAD]!.messages).toHaveLength(0);
  });

  it('marks the reply as stopped when the user stops generation', async () => {
    vi.mocked(chatService.streamMessage).mockImplementation(async (_b, cb, signal) => {
      cb.onMeta?.({ conversation, created: false, userMessage: msg({ id: 'u1' }), assistantMessage: msg({ id: 'a1', role: 'assistant', status: 'streaming' }) });
      cb.onDelta?.('Partial');
      await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    });
    const pending = sendMessage({ threadKey: 'c1', content: 'Long', attachments: [] });
    await Promise.resolve();
    stopGenerating('c1');
    await pending;
    const a = getChatState().threads.c1!.messages.find((m) => m.id === 'a1')!;
    expect(a.status).toBe('stopped');
    expect(a.content).toBe('Partial');
  });

  it('surfaces provider errors on the assistant message for retry', async () => {
    vi.mocked(chatService.streamMessage).mockImplementation(async (_b, cb) => {
      cb.onMeta?.({ conversation, created: false, userMessage: msg({ id: 'u1' }), assistantMessage: msg({ id: 'a1', role: 'assistant', status: 'streaming' }) });
      cb.onError?.({ code: 'AI_UNAVAILABLE', message: 'Provider down' });
    });
    await sendMessage({ threadKey: 'c1', content: 'x', attachments: [] });
    const a = getChatState().threads.c1!.messages.find((m) => m.id === 'a1')!;
    expect(a.status).toBe('error');
    expect(a.error).toBe('Provider down');
  });

  it('applies feedback optimistically and reverts on failure', async () => {
    vi.mocked(chatService.streamMessage).mockImplementation(async (_b, cb) => {
      cb.onMeta?.({ conversation, created: false, userMessage: msg({ id: 'u1' }), assistantMessage: msg({ id: 'a1', role: 'assistant' }) });
    });
    await sendMessage({ threadKey: 'c1', content: 'x', attachments: [] });
    vi.mocked(chatService.feedback).mockRejectedValueOnce(new Error('nope'));
    const a = getChatState().threads.c1!.messages.find((m) => m.id === 'a1')!;
    await expect(rateMessage('c1', a, 'like')).rejects.toThrow();
    expect(getChatState().threads.c1!.messages.find((m) => m.id === 'a1')!.feedback).toBeNull();
  });
});
