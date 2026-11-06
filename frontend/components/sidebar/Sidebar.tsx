'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { HelpCircle, PanelLeftClose, PanelLeftOpen, Search, Settings, SquarePen } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import { SearchDialog } from './SearchDialog';
import { UserMenu } from './UserMenu';
import { ShareDialog } from '@/components/chat/ShareDialog';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { IconButton, Button } from '@/components/ui/Button';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { Skeleton } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { clearNewThread, deleteConversation, loadConversations, renameConversation, setArchived, togglePin, useChatStore } from '@/lib/chatStore';
import { errorMessage } from '@/lib/api';
import { cn, groupByDate, type DateGroup } from '@/lib/utils';
import { useT, type TKey } from '@/lib/i18n';
import type { Conversation } from '@/types';

const GROUP_LABELS: Record<DateGroup, TKey> = {
  pinned: 'sidebar.pinned',
  today: 'sidebar.today',
  yesterday: 'sidebar.yesterday',
  previous7: 'sidebar.previous7',
  previous30: 'sidebar.previous30',
  older: 'sidebar.older',
};

export function Sidebar({ collapsed, onToggle, mobile }: { collapsed: boolean; onToggle: () => void; mobile?: boolean }) {
  const { t } = useT();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  const conversations = useChatStore((s) => s.conversations);
  const listLoaded = useChatStore((s) => s.listLoaded);
  const listLoading = useChatStore((s) => s.listLoading);
  const listError = useChatStore((s) => s.listError);
  const nextCursor = useChatStore((s) => s.nextCursor);
  const streaming = useChatStore((s) => s.streaming);

  const [searchOpen, setSearchOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    if (!listLoaded) void loadConversations(true);
  }, [listLoaded]);

  // Ctrl/Cmd+K opens search, Ctrl/Cmd+Shift+O starts a new chat.
  useEffect(() => {
    if (mobile) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  const groups = useMemo(() => groupByDate(conversations), [conversations]);

  function newChat() {
    clearNewThread();
    router.push('/chat');
    if (mobile) onToggle();
  }

  const handlers = useMemo(
    () => ({
      onRename: (c: Conversation, title: string) => renameConversation(c.id, title).catch((err) => toast(errorMessage(err), 'error')),
      onDelete: (c: Conversation) => setToDelete(c),
      onTogglePin: (c: Conversation) => togglePin(c).catch((err) => toast(errorMessage(err), 'error')),
      onShare: (c: Conversation) => setShareId(c.id),
      onArchive: (c: Conversation) =>
        setArchived(c.id, true)
          .then(() => {
            toast('Chat archived. Find it in Settings → Data controls.', 'success');
            if (activeId === c.id) router.push('/chat');
          })
          .catch((err) => toast(errorMessage(err), 'error')),
    }),
    [toast, activeId, router],
  );

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteConversation(toDelete.id);
      toast('Chat deleted', 'success');
      if (activeId === toDelete.id) router.push('/chat');
      setToDelete(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  }

  const navLink = (href: string, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      onClick={mobile ? onToggle : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-2 transition-colors hover:bg-hover hover:text-fg',
        pathname === href && 'bg-hover text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );

  return (
    <nav className="flex h-full w-full flex-col" aria-label="Sidebar">
      <div className={cn('flex h-14 shrink-0 items-center px-3', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <Link href="/chat" onClick={newChat} aria-label="Kairo home">
            <Logo size={26} />
          </Link>
        )}
        <IconButton label={collapsed ? 'Expand sidebar' : mobile ? 'Close sidebar' : 'Collapse sidebar'} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </IconButton>
      </div>

      <div className={cn('space-y-0.5 px-2', collapsed && 'flex flex-col items-center')}>
        <button
          onClick={newChat}
          title={collapsed ? t('sidebar.newChat') : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-hover',
            collapsed && 'justify-center px-0',
          )}
        >
          <SquarePen className="h-[18px] w-[18px]" />
          {!collapsed && <span className="flex-1 text-left">{t('sidebar.newChat')}</span>}
          {!collapsed && !mobile && <kbd className="hidden text-[11px] text-muted lg:inline">⇧⌘O</kbd>}
        </button>
        <button
          onClick={() => setSearchOpen(true)}
          title={collapsed ? t('sidebar.search') : undefined}
          className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-2 transition-colors hover:bg-hover hover:text-fg', collapsed && 'justify-center px-0')}
        >
          <Search className="h-[18px] w-[18px]" />
          {!collapsed && <span className="flex-1 text-left">{t('sidebar.search')}</span>}
          {!collapsed && !mobile && <kbd className="hidden text-[11px] text-muted lg:inline">⌘K</kbd>}
        </button>
      </div>

      <div className="scroll-thin mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {collapsed ? (
          <div className="flex justify-center pt-2">
            <LogoMark size={22} className="opacity-40" />
          </div>
        ) : !listLoaded && listLoading ? (
          <div className="space-y-2 px-1 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
            ))}
          </div>
        ) : listError && conversations.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted">
            <p>{listError}</p>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => loadConversations(true)}>
              Retry
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted">{t('sidebar.empty')}</p>
        ) : (
          (Object.keys(GROUP_LABELS) as DateGroup[]).map((g) =>
            groups[g].length ? (
              <section key={g} className="mb-3">
                <h3 className="sticky top-0 z-10 bg-sidebar px-2.5 pt-2 pb-1 text-xs font-medium text-muted">{t(GROUP_LABELS[g])}</h3>
                <div className="space-y-px">
                  {groups[g].map((c) => (
                    <ConversationItem
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      streaming={Boolean(streaming[c.id])}
                      onNavigate={mobile ? onToggle : undefined}
                      {...handlers}
                    />
                  ))}
                </div>
              </section>
            ) : null,
          )
        )}
        {!collapsed && nextCursor && (
          <div className="flex justify-center py-2">
            <Button size="sm" variant="ghost" loading={listLoading} onClick={() => loadConversations(false)}>
              {t('sidebar.loadMore')}
            </Button>
          </div>
        )}
      </div>

      <div className={cn('shrink-0 space-y-0.5 border-t border-border p-2', collapsed && 'flex flex-col items-center')}>
        {navLink('/settings', <Settings className="h-[18px] w-[18px]" />, t('menu.settings'))}
        {navLink('/help', <HelpCircle className="h-[18px] w-[18px]" />, t('menu.help'))}
        <UserMenu collapsed={collapsed} />
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t('confirm.deleteChat.title')}
        description={t('confirm.deleteChat.body', { title: toDelete?.title ?? '' })}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
      />
      {shareId && <ShareDialog open onClose={() => setShareId(null)} conversationId={shareId} />}
    </nav>
  );
}
