'use client';

import { memo, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Archive, MoreHorizontal, Pencil, Pin, PinOff, Share2, Trash2, Loader2 } from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Conversation } from '@/types';

export const ConversationItem = memo(function ConversationItem({
  conversation,
  active,
  streaming,
  onRename,
  onDelete,
  onTogglePin,
  onShare,
  onArchive,
  onNavigate,
}: {
  onArchive: (c: Conversation) => void;
  conversation: Conversation;
  active: boolean;
  streaming: boolean;
  onRename: (c: Conversation, title: string) => void;
  onDelete: (c: Conversation) => void;
  onTogglePin: (c: Conversation) => void;
  onShare: (c: Conversation) => void;
  onNavigate?: () => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setTitle(conversation.title);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, conversation.title]);

  const commit = () => {
    setEditing(false);
    const next = title.trim();
    if (next && next !== conversation.title) onRename(conversation, next);
  };

  if (editing) {
    return (
      <div className="px-1 py-0.5">
        <input
          ref={inputRef}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label="Conversation title"
          className="h-9 w-full rounded-lg border border-accent bg-surface px-2.5 text-sm text-fg outline-none ring-4 ring-accent-soft"
        />
      </div>
    );
  }

  return (
    <div className={cn('group relative flex items-center rounded-lg transition-colors', active ? 'bg-hover' : 'hover:bg-hover')}>
      <Link
        href={`/chat/${conversation.id}`}
        onClick={onNavigate}
        onDoubleClick={(e) => {
          e.preventDefault();
          setEditing(true);
        }}
        className={cn('flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 pl-2.5 text-sm', active ? 'text-fg' : 'text-fg-2')}
        title={conversation.title}
        aria-current={active ? 'page' : undefined}
      >
        {streaming && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />}
        <span className="truncate">{conversation.title}</span>
      </Link>
      <Menu
        className={cn('shrink-0', active ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100')}
        trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            aria-label={`Options for ${conversation.title}`}
            className={cn('mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-fg', open && 'text-fg')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        items={[
          { label: t('action.rename'), icon: <Pencil className="h-4 w-4" />, onSelect: () => setEditing(true) },
          { label: conversation.pinned ? t('action.unpin') : t('action.pin'), icon: conversation.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />, onSelect: () => onTogglePin(conversation) },
          { label: t('action.share'), icon: <Share2 className="h-4 w-4" />, onSelect: () => onShare(conversation) },
          { label: 'Archive', icon: <Archive className="h-4 w-4" />, onSelect: () => onArchive(conversation) },
          'separator',
          { label: t('action.delete'), icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => onDelete(conversation) },
        ]}
      />
    </div>
  );
});
