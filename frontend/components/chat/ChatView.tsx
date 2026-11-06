'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, Loader2, MessageSquareOff } from 'lucide-react';
import { Composer, type ComposerHandle } from './Composer';
import { MessageItem } from './MessageItem';
import { ModelSelector } from './ModelSelector';
import { WelcomeScreen } from './WelcomeScreen';
import { ShareDialog } from './ShareDialog';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton, Alert } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/api';
import {
  NEW_THREAD,
  deleteMessage,
  editAndResend,
  loadOlder,
  loadThread,
  rateMessage,
  regenerate,
  sendMessage,
  setConversationModel,
  setDraftModel,
  stopGenerating,
  useChatStore,
} from '@/lib/chatStore';
import type { Attachment, Message } from '@/types';
import { useMobileNav } from '@/components/layout/AppShell';

const WIDTHS = { narrow: 'max-w-2xl', default: 'max-w-3xl', wide: 'max-w-5xl' } as const;

export function ChatView({ conversationId }: { conversationId?: string }) {
  const key = conversationId ?? NEW_THREAD;
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useT();
  const { user } = useAuth();
  const { data: settings } = useUserSettings();
  const composerRef = useRef<ComposerHandle>(null);
  const { MobileHeaderSlot } = useMobileNav();

  const thread = useChatStore((s) => s.threads[key]);
  const streaming = useChatStore((s) => Boolean(s.streaming[key]));
  const conversation = useChatStore((s) => (conversationId ? s.conversations.find((c) => c.id === conversationId) : undefined));
  const draftModel = useChatStore((s) => s.draftModel);

  const [pendingDelete, setPendingDelete] = useState<Message | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages]);
  const lastContent = messages.at(-1)?.content.length ?? 0;
  const autoScroll = user?.preferences.autoScroll ?? true;
  // A new message from the user always jumps to the bottom; streaming follows only if auto-scroll is on.
  const { ref: scrollRef, onScroll, atBottom, scrollToBottom } = useAutoScroll<HTMLDivElement>([messages.length, lastContent], autoScroll);
  const width = WIDTHS[user?.preferences.chatWidth ?? 'default'];

  useEffect(() => {
    if (conversationId) void loadThread(conversationId);
  }, [conversationId]);

  // Models: conversation model > draft selection > user default > app default.
  const models = settings?.models ?? [];
  // First candidate that is still available (models can be removed, e.g. after switching AI providers).
  const isAvailable = (id: string | null | undefined): id is string => Boolean(id && models.some((m) => m.id === id && m.available));
  const selectedModel =
    [conversation?.model, draftModel, user?.preferences.defaultModel, settings?.defaultModel].find(isAvailable) ?? settings?.defaultModel ?? null;
  const prefs = user?.preferences;

  const handleModelChange = useCallback(
    async (model: string) => {
      if (conversationId) {
        try {
          await setConversationModel(conversationId, model);
        } catch (err) {
          toast(errorMessage(err), 'error');
        }
      } else setDraftModel(model);
    },
    [conversationId, toast],
  );

  const handleSend = useCallback(
    async (content: string, attachments: Attachment[]) => {
      const result = await sendMessage({
        threadKey: key,
        content,
        attachments,
        model: selectedModel,
        onCreated: (id) => router.replace(`/chat/${id}`),
      });
      if (!result.ok) toast(result.error ?? 'Message failed to send', 'error');
      else if (result.error) toast(result.error, 'error');
      return result.ok;
    },
    [key, selectedModel, router, toast],
  );

  const handlers = useMemo(
    () => ({
      onEdit: (m: Message, content: string) => {
        void editAndResend(key, m.id, content, selectedModel).catch((err) => toast(errorMessage(err), 'error'));
      },
      onDelete: (m: Message) => setPendingDelete(m),
      onRegenerate: (m: Message) => {
        void regenerate(key, m.id, selectedModel).then((r) => r.error && toast(r.error, 'error'));
      },
      onRate: (m: Message, rating: 'like' | 'dislike' | null) => {
        void rateMessage(key, m, rating)
          .then(() => rating && toast(rating === 'like' ? 'Thanks for the feedback!' : 'Thanks — we’ll use this to improve.', 'success'))
          .catch((err) => toast(errorMessage(err), 'error'));
      },
      onShare: () => setShareOpen(true),
    }),
    [key, selectedModel, toast],
  );

  const notFound = thread?.error === 'not_found';
  const initialLoading = Boolean(conversationId) && (!thread || (thread.loading && !thread.loaded));
  const isEmpty = !conversationId && messages.length === 0;

  const header = (
    <div className="flex min-w-0 items-center gap-1">
      <ModelSelector models={models} value={selectedModel} onChange={handleModelChange} disabled={streaming} />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileHeaderSlot>{header}</MobileHeaderSlot>
      <div className="hidden h-14 shrink-0 items-center justify-between px-3 md:flex">
        {header}
        {conversation && (
          <span className="mr-2 max-w-[40%] truncate text-sm text-muted" title={conversation.title}>
            {conversation.title}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="scroll-thin h-full overflow-y-auto overflow-x-hidden">
          {notFound ? (
            <EmptyState
              icon={<MessageSquareOff className="h-8 w-8" />}
              title="Conversation not found"
              description="It may have been deleted, or it belongs to another account."
              action={<Button onClick={() => router.push('/chat')}>{t('sidebar.newChat')}</Button>}
            />
          ) : initialLoading ? (
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="ml-auto h-10 w-2/5 rounded-3xl" />
                  <div className="flex gap-3">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-4 w-3/5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex min-h-full items-center justify-center py-10">
              <WelcomeScreen onPick={(prompt) => composerRef.current?.setText(prompt)} showSuggestions={prefs?.suggestedPrompts ?? true} />
            </div>
          ) : (
            <div className={`mx-auto w-full ${width} space-y-6 px-4 pt-4 pb-10 sm:px-6`}>
              {thread?.error && thread.error !== 'not_found' && <Alert>{thread.error}</Alert>}
              {thread?.hasMore && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => conversationId && void loadOlder(conversationId)} loading={thread.loadingOlder}>
                    {t('chat.loadOlder')}
                  </Button>
                </div>
              )}
              {messages.map((m, i) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  isLast={i === messages.length - 1}
                  busy={streaming}
                  showTimestamps={prefs?.showTimestamps ?? true}
                  showTokenUsage={prefs?.showTokenUsage ?? false}
                  {...handlers}
                />
              ))}
            </div>
          )}
        </div>
        {!atBottom && !isEmpty && (
          <button
            onClick={() => scrollToBottom()}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-soft hover:bg-surface-2"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {!notFound && (
        <div className="shrink-0 px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className={`mx-auto w-full ${width}`}>
            <Composer
              ref={composerRef}
              onSend={handleSend}
              onStop={() => stopGenerating(key)}
              streaming={streaming}
              sendOnEnter={prefs?.sendOnEnter ?? true}
              disabled={initialLoading || models.every((m) => !m.available)}
              autoFocus
            />
            <p className="mt-2 text-center text-xs text-muted">{t('composer.disclaimer')}</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete message?"
        description="This deletes your message and the AI response to it. This cannot be undone."
        onConfirm={() => {
          const m = pendingDelete;
          setPendingDelete(null);
          if (m) void deleteMessage(key, m.id).catch((err) => toast(errorMessage(err), 'error'));
        }}
      />
      {conversationId && <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} conversationId={conversationId} />}
    </div>
  );
}
