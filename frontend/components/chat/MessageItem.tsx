'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Copy, Pencil, RefreshCw, Share2, ThumbsDown, ThumbsUp, Trash2, CircleStop } from 'lucide-react';
import { Markdown } from './Markdown';
import { TypingIndicator } from './TypingIndicator';
import { AttachmentChip } from './AttachmentChip';
import { IconButton, Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { useCopy } from '@/hooks/useCopy';
import { useT } from '@/lib/i18n';
import { cn, formatTime } from '@/lib/utils';
import type { Message } from '@/types';

export interface MessageHandlers {
  onEdit: (m: Message, content: string) => void;
  onDelete: (m: Message) => void;
  onRegenerate: (m: Message) => void;
  onRate: (m: Message, rating: 'like' | 'dislike' | null) => void;
  onShare: (m: Message) => void;
}

interface Props extends MessageHandlers {
  message: Message;
  isLast: boolean;
  busy: boolean;
  showTimestamps: boolean;
  showTokenUsage?: boolean;
}

function UserMessage({ message, busy, showTimestamps, onEdit, onDelete }: Props) {
  const { t, lang } = useT();
  const { copied, copy } = useCopy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  const isTemp = message.id.startsWith('tmp-');

  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [editing]);

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[85%] rounded-2xl border border-border bg-surface p-3 shadow-sm sm:max-w-[75%]">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 400)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
              e.preventDefault();
              setEditing(false);
              onEdit(message, draft.trim());
            }
          }}
          aria-label="Edit message"
          className="scroll-thin w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg outline-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            {t('action.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!draft.trim() || draft.trim() === message.content}
            onClick={() => {
              setEditing(false);
              onEdit(message, draft.trim());
            }}
          >
            {t('action.save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end gap-1.5">
      {message.attachments.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {message.attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} compact />
          ))}
        </div>
      )}
      <div className="max-w-[85%] rounded-3xl bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-fg sm:max-w-[75%]" style={{ overflowWrap: 'anywhere' }}>
        {message.content}
      </div>
      <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {showTimestamps && <span className="mr-1 text-xs text-muted">{formatTime(message.createdAt, lang)}{message.editedAt ? ' · edited' : ''}</span>}
        <IconButton size="sm" label={copied ? t('action.copied') : t('action.copy')} onClick={() => copy(message.content)}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </IconButton>
        <IconButton size="sm" label={t('action.edit')} disabled={busy || isTemp} onClick={() => {
          setDraft(message.content);
          setEditing(true);
        }}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton size="sm" label={t('action.delete')} disabled={busy || isTemp} onClick={() => onDelete(message)}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}

function AssistantMessage({ message, isLast, busy, showTimestamps, showTokenUsage, onRegenerate, onRate, onShare }: Props) {
  const { t, lang } = useT();
  const { copied, copy } = useCopy();
  const streaming = message.status === 'streaming';
  const isTemp = message.id.startsWith('tmp-');
  const rating = message.feedback?.rating ?? null;

  return (
    <div className="group flex gap-3 sm:gap-4">
      <div className="mt-0.5 shrink-0">
        <LogoMark size={28} />
      </div>
      <div className="min-w-0 flex-1">
        {streaming && !message.content ? (
          <TypingIndicator label={t('chat.thinking')} />
        ) : (
          <div>
            <Markdown content={message.content} />
            {streaming && <span className="stream-caret" aria-hidden />}
          </div>
        )}

        {message.status === 'stopped' && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <CircleStop className="h-3.5 w-3.5" /> {t('chat.stopped')}
          </p>
        )}
        {message.status === 'error' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{message.error ?? 'The response failed.'}</span>
            {!isTemp && (
              <Button size="sm" variant="secondary" onClick={() => onRegenerate(message)} disabled={busy}>
                <RefreshCw className="h-3.5 w-3.5" /> {t('action.retry')}
              </Button>
            )}
          </div>
        )}

        {!streaming && (
          <div className={cn('mt-1.5 -ml-2 flex items-center gap-0.5 transition-opacity', isLast ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100')}>
            <IconButton size="sm" label={copied ? t('action.copied') : t('action.copy')} onClick={() => copy(message.content)} disabled={!message.content}>
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </IconButton>
            <IconButton size="sm" label={t('action.like')} active={rating === 'like'} disabled={isTemp || message.status === 'error'} onClick={() => onRate(message, rating === 'like' ? null : 'like')}>
              <ThumbsUp className={cn('h-4 w-4', rating === 'like' && 'fill-current text-accent')} />
            </IconButton>
            <IconButton size="sm" label={t('action.dislike')} active={rating === 'dislike'} disabled={isTemp || message.status === 'error'} onClick={() => onRate(message, rating === 'dislike' ? null : 'dislike')}>
              <ThumbsDown className={cn('h-4 w-4', rating === 'dislike' && 'fill-current text-danger')} />
            </IconButton>
            <IconButton size="sm" label={t('action.share')} disabled={isTemp} onClick={() => onShare(message)}>
              <Share2 className="h-4 w-4" />
            </IconButton>
            <IconButton size="sm" label={t('action.regenerate')} disabled={busy || isTemp} onClick={() => onRegenerate(message)}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            {showTimestamps && (
              <span className="ml-1 text-xs text-muted">
                {formatTime(message.createdAt, lang)}
                {message.model ? ` · ${message.model}` : ''}
              </span>
            )}
            {showTokenUsage && message.tokenUsage && (
              <span className="ml-1 text-xs text-muted tabular-nums" title={`${message.tokenUsage.promptTokens} prompt + ${message.tokenUsage.completionTokens} completion`}>
                · {message.tokenUsage.totalTokens.toLocaleString()} tokens
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageItem = memo(function MessageItem(props: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} data-role={props.message.role}>
      {props.message.role === 'user' ? <UserMessage {...props} /> : <AssistantMessage {...props} />}
    </motion.div>
  );
});
