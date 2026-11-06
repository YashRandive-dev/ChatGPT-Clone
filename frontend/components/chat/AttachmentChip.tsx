'use client';

import { FileText, FileType2, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn, formatBytes } from '@/lib/utils';
import { fileUrl } from '@/lib/api';
import type { Attachment } from '@/types';

/** Fetches an owned image with credentials and exposes it as an object URL. */
export function useAuthedImage(id: string | null, enabled: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !enabled) return;
    let url: string | null = null;
    let cancelled = false;
    fetch(fileUrl(id), { credentials: 'include' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && !cancelled) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, enabled]);
  return src;
}

export function AttachmentChip({
  attachment,
  progress,
  error,
  localPreview,
  onRemove,
  compact,
}: {
  attachment: Pick<Attachment, 'name' | 'kind' | 'size'> & { id?: string };
  progress?: number | null;
  error?: string | null;
  localPreview?: string | null;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const isImage = attachment.kind === 'image';
  const remote = useAuthedImage(attachment.id ?? null, isImage && !localPreview);
  const preview = localPreview ?? remote;
  const uploading = progress !== null && progress !== undefined && progress < 100;
  const Icon = isImage ? ImageIcon : attachment.kind === 'pdf' ? FileType2 : FileText;
  const href = attachment.id && !uploading ? fileUrl(attachment.id) : undefined;

  const body = (
    <>
      {isImage && preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={attachment.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', attachment.kind === 'pdf' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent')}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{attachment.name}</span>
        <span className={cn('block text-xs', error ? 'text-danger' : 'text-muted')}>
          {error ? error : uploading ? `Uploading… ${progress}%` : `${attachment.kind.toUpperCase()} · ${formatBytes(attachment.size)}`}
        </span>
      </span>
    </>
  );

  return (
    <div className={cn('relative flex items-center gap-2.5 rounded-xl border bg-surface p-2 pr-3', error ? 'border-danger/40' : 'border-border', compact ? 'max-w-[240px]' : 'max-w-[280px]')}>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5">
          {body}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">{body}</span>
      )}
      {uploading && (
        <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-border">
          <span className="block h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-fg"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
