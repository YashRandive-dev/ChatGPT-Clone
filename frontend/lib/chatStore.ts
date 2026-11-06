'use client';

import { useSyncExternalStore } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { chatService, type StreamCallbacks } from '@/services/chatService';
import type { Attachment, Conversation, Message } from '@/types';

/**
 * Client-side chat state. Lives outside React so token-by-token streaming updates only
 * re-render the components that subscribe to the affected slice, and so an in-flight stream
 * survives route changes (e.g. /chat -> /chat/:id after the first message).
 */

export const NEW_THREAD = 'new';

export interface Thread {
  messages: Message[];
  loaded: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  error: string | null;
}

export interface ChatState {
  conversations: Conversation[];
  nextCursor: string | null;
  listLoading: boolean;
  listLoaded: boolean;
  listError: string | null;
  threads: Record<string, Thread>;
  /** thread key -> true while a response is streaming */
  streaming: Record<string, boolean>;
  draftModel: string | null;
}

const emptyThread = (): Thread => ({ messages: [], loaded: false, loading: false, hasMore: false, loadingOlder: false, error: null });

let state: ChatState = {
  conversations: [],
  nextCursor: null,
  listLoading: false,
  listLoaded: false,
  listError: null,
  threads: {},
  streaming: {},
  draftModel: null,
};
const listeners = new Set<() => void>();

export function getChatState() {
  return state;
}

function setState(updater: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) {
  const patch = typeof updater === 'function' ? updater(state) : updater;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatStore<T>(selector: (s: ChatState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function resetChatStore() {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  state = { conversations: [], nextCursor: null, listLoading: false, listLoaded: false, listError: null, threads: {}, streaming: {}, draftModel: null };
  listeners.forEach((l) => l());
}

// ---------- helpers ----------

function updateThread(key: string, fn: (t: Thread) => Partial<Thread>) {
  setState((s) => {
    const current = s.threads[key] ?? emptyThread();
    return { threads: { ...s.threads, [key]: { ...current, ...fn(current) } } };
  });
}

function updateMessage(key: string, id: string, fn: (m: Message) => Partial<Message>) {
  updateThread(key, (t) => ({ messages: t.messages.map((m) => (m.id === id ? { ...m, ...fn(m) } : m)) }));
}

function setStreaming(key: string, on: boolean) {
  setState((s) => {
    const next = { ...s.streaming };
    if (on) next[key] = true;
    else delete next[key];
    return { streaming: next };
  });
}

function upsertConversation(c: Conversation, moveToTop = true) {
  setState((s) => {
    const rest = s.conversations.filter((x) => x.id !== c.id);
    const existing = s.conversations.find((x) => x.id === c.id);
    const merged = existing ? { ...existing, ...c } : c;
    return { conversations: moveToTop ? [merged, ...rest] : s.conversations.map((x) => (x.id === c.id ? merged : x)) };
  });
}

let tempCounter = 0;
const tempId = (p: string) => `tmp-${p}-${Date.now()}-${++tempCounter}`;

function tempMessage(role: 'user' | 'assistant', conversationId: string, content = '', attachments: Attachment[] = []): Message {
  return {
    id: tempId(role[0]!),
    conversationId,
    role,
    content,
    attachments,
    feedback: null,
    tokenUsage: null,
    model: null,
    status: role === 'assistant' ? 'streaming' : 'complete',
    error: null,
    editedAt: null,
    createdAt: new Date().toISOString(),
  };
}

const controllers = new Map<string, AbortController>();

// ---------- conversation list ----------

export async function loadConversations(reset = true) {
  const s = getChatState();
  if (s.listLoading || (!reset && !s.nextCursor)) return;
  setState({ listLoading: true, listError: null });
  try {
    const res = await chatService.listConversations({ cursor: reset ? null : s.nextCursor });
    setState((st) => ({
      conversations: reset ? res.conversations : [...st.conversations, ...res.conversations.filter((c) => !st.conversations.some((x) => x.id === c.id))],
      nextCursor: res.nextCursor,
      listLoaded: true,
    }));
  } catch (err) {
    setState({ listError: errorMessage(err) });
  } finally {
    setState({ listLoading: false });
  }
}

export async function renameConversation(id: string, title: string) {
  const { conversation } = await chatService.updateConversation(id, { title });
  upsertConversation(conversation, false);
}

export async function togglePin(c: Conversation) {
  const { conversation } = await chatService.updateConversation(c.id, { pinned: !c.pinned });
  upsertConversation(conversation, false);
}

export async function setConversationModel(id: string, model: string) {
  const { conversation } = await chatService.updateConversation(id, { model });
  upsertConversation(conversation, false);
}

/** Archives (hides from the sidebar) or restores a conversation. */
export async function setArchived(id: string, archived: boolean) {
  const { conversation } = await chatService.updateConversation(id, { archived });
  if (archived) setState((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }));
  else upsertConversation(conversation);
  return conversation;
}

export async function archiveAllConversations() {
  const res = await chatService.archiveAll();
  setState({ conversations: [], nextCursor: null });
  return res.archived;
}

export async function deleteConversation(id: string) {
  controllers.get(id)?.abort();
  await chatService.deleteConversation(id);
  setState((s) => {
    const threads = { ...s.threads };
    delete threads[id];
    return { conversations: s.conversations.filter((c) => c.id !== id), threads };
  });
}

export async function deleteAllConversations() {
  await chatService.deleteAllConversations();
  resetChatStore();
}

export async function shareConversation(id: string) {
  const { shareId } = await chatService.share(id);
  upsertConversation({ ...(getChatState().conversations.find((c) => c.id === id) as Conversation), shareId, shared: true }, false);
  return `${window.location.origin}/share/${shareId}`;
}

export function setDraftModel(model: string | null) {
  setState({ draftModel: model });
}

// ---------- messages ----------

export async function loadThread(id: string, force = false) {
  const t = getChatState().threads[id];
  if (!force && t && (t.loaded || t.loading)) return;
  if (getChatState().streaming[id]) return;
  updateThread(id, () => ({ loading: true, error: null }));
  try {
    const res = await chatService.getConversation(id);
    upsertConversation(res.conversation, false);
    updateThread(id, () => ({ messages: res.messages, hasMore: res.hasMore, loaded: true }));
  } catch (err) {
    updateThread(id, () => ({ error: err instanceof ApiError && err.status === 404 ? 'not_found' : errorMessage(err) }));
  } finally {
    updateThread(id, () => ({ loading: false }));
  }
}

export async function loadOlder(id: string) {
  const t = getChatState().threads[id];
  if (!t || !t.hasMore || t.loadingOlder) return;
  const oldest = t.messages.find((m) => !m.id.startsWith('tmp-'));
  if (!oldest) return;
  updateThread(id, () => ({ loadingOlder: true }));
  try {
    const res = await chatService.getConversation(id, oldest.id);
    updateThread(id, (cur) => ({ messages: [...res.messages, ...cur.messages], hasMore: res.hasMore }));
  } finally {
    updateThread(id, () => ({ loadingOlder: false }));
  }
}

interface StreamTarget {
  key: string;
  assistantTempId: string;
  userTempId?: string;
  onCreated?: (conversationId: string) => void;
}

/** Wires SSE events to store updates for a single generation. */
function streamCallbacks(target: StreamTarget): StreamCallbacks & { state: { key: string; assistantId: string; gotMeta: boolean } } {
  const st = { key: target.key, assistantId: target.assistantTempId, gotMeta: false };
  return {
    state: st,
    onMeta: (meta) => {
      st.gotMeta = true;
      const conversationId = meta.conversation.id;
      upsertConversation(meta.conversation);
      if (st.key !== conversationId) {
        // First message of a new chat: move the optimistic thread under the real id.
        const thread = getChatState().threads[st.key] ?? emptyThread();
        setState((s) => {
          const threads = { ...s.threads, [conversationId]: { ...thread, loaded: true } };
          delete threads[st.key];
          const streaming = { ...s.streaming, [conversationId]: true };
          delete streaming[st.key];
          return { threads, streaming };
        });
        const ctrl = controllers.get(st.key);
        if (ctrl) {
          controllers.delete(st.key);
          controllers.set(conversationId, ctrl);
        }
        st.key = conversationId;
        target.onCreated?.(conversationId);
      }
      updateThread(st.key, (t) => ({
        messages: t.messages.map((m) =>
          m.id === target.userTempId ? meta.userMessage : m.id === target.assistantTempId ? { ...meta.assistantMessage, content: m.content } : m,
        ),
      }));
      st.assistantId = meta.assistantMessage.id;
    },
    onDelta: (text) => updateMessage(st.key, st.assistantId, (m) => ({ content: m.content + text })),
    onTitle: ({ conversationId, title }) => {
      const c = getChatState().conversations.find((x) => x.id === conversationId);
      if (c) upsertConversation({ ...c, title }, false);
    },
    onDone: ({ message }) => updateMessage(st.key, st.assistantId, () => message),
    onError: (data) =>
      updateMessage(st.key, st.assistantId, (m) => ({ ...(data.message_record ?? {}), content: data.message_record?.content ?? m.content, status: 'error', error: data.message })),
  };
}

async function runStream(
  target: StreamTarget,
  start: (cb: StreamCallbacks, signal: AbortSignal) => Promise<void>,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  controllers.set(target.key, controller);
  setStreaming(target.key, true);
  const cb = streamCallbacks(target);
  try {
    await start(cb, controller.signal);
    return { ok: true };
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    if (aborted) {
      updateMessage(cb.state.key, cb.state.assistantId, (m) => ({ status: m.status === 'streaming' ? 'stopped' : m.status }));
      if (!cb.state.gotMeta) void loadConversations(true);
      return { ok: true };
    }
    const message = errorMessage(err);
    if (!cb.state.gotMeta) return { ok: false, error: message };
    updateMessage(cb.state.key, cb.state.assistantId, () => ({ status: 'error', error: message }));
    return { ok: true, error: message };
  } finally {
    controllers.delete(cb.state.key);
    setStreaming(cb.state.key, false);
    setStreaming(target.key, false);
  }
}

/**
 * Sends a message. Returns { ok: false } when the request failed before anything was saved,
 * so the caller can restore the composer text.
 */
export async function sendMessage(params: {
  threadKey: string;
  content: string;
  attachments: Attachment[];
  model?: string | null;
  onCreated?: (conversationId: string) => void;
}) {
  const { threadKey, content, attachments, model, onCreated } = params;
  const conversationId = threadKey === NEW_THREAD ? undefined : threadKey;
  const userMsg = tempMessage('user', threadKey, content, attachments);
  const assistantMsg = tempMessage('assistant', threadKey);
  updateThread(threadKey, (t) => ({ messages: [...t.messages, userMsg, assistantMsg], loaded: true, error: null }));

  const result = await runStream({ key: threadKey, assistantTempId: assistantMsg.id, userTempId: userMsg.id, onCreated }, (cb, signal) =>
    chatService.streamMessage({ conversationId, content, model: model ?? undefined, attachments: attachments.map((a) => a.id) }, cb, signal),
  );
  if (!result.ok) {
    // Nothing was persisted: roll back the optimistic messages.
    updateThread(threadKey, (t) => ({ messages: t.messages.filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id) }));
  }
  return result;
}

export function stopGenerating(threadKey: string) {
  controllers.get(threadKey)?.abort();
}

/** Regenerates from a message: an assistant message is replaced; a user message gets a new reply. */
export async function regenerate(threadKey: string, messageId: string, model?: string | null) {
  const thread = getChatState().threads[threadKey];
  if (!thread) return { ok: false };
  const idx = thread.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return { ok: false };
  const target = thread.messages[idx]!;
  const keep = target.role === 'assistant' ? thread.messages.slice(0, idx) : thread.messages.slice(0, idx + 1);
  const assistantMsg = tempMessage('assistant', threadKey);
  updateThread(threadKey, () => ({ messages: [...keep, assistantMsg] }));
  const result = await runStream({ key: threadKey, assistantTempId: assistantMsg.id }, (cb, signal) =>
    chatService.regenerate(messageId, { model: model ?? undefined }, cb, signal),
  );
  if (!result.ok) updateMessage(threadKey, assistantMsg.id, () => ({ status: 'error', error: result.error ?? 'Failed to regenerate' }));
  return result;
}

/** Edits a user message (discarding later messages) and streams a fresh answer. */
export async function editAndResend(threadKey: string, messageId: string, content: string, model?: string | null) {
  const res = await chatService.editMessage(messageId, content);
  updateThread(threadKey, (t) => {
    const idx = t.messages.findIndex((m) => m.id === messageId);
    return { messages: [...t.messages.slice(0, idx), res.message] };
  });
  return regenerate(threadKey, messageId, model);
}

export async function deleteMessage(threadKey: string, messageId: string) {
  const res = await chatService.deleteMessage(messageId);
  updateThread(threadKey, (t) => ({ messages: t.messages.filter((m) => !res.removedIds.includes(m.id)) }));
}

export async function rateMessage(threadKey: string, message: Message, rating: 'like' | 'dislike' | null, comment?: string) {
  const previous = message.feedback;
  updateMessage(threadKey, message.id, () => ({ feedback: rating ? { rating, comment: comment ?? null } : null }));
  try {
    await chatService.feedback(message.id, rating, comment);
  } catch (err) {
    updateMessage(threadKey, message.id, () => ({ feedback: previous }));
    throw err;
  }
}

export function clearNewThread() {
  if (getChatState().streaming[NEW_THREAD]) return;
  setState((s) => {
    const threads = { ...s.threads };
    delete threads[NEW_THREAD];
    return { threads };
  });
}
