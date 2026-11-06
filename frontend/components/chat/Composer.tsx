'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import { AttachmentChip } from './AttachmentChip';
import { IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ACCEPTED_TYPES, fileService, validateFile } from '@/services/fileService';
import { errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';

const MAX_ATTACHMENTS = 5;
const MAX_CHARS = 32000;

interface PendingFile {
  key: string;
  file: File;
  progress: number;
  uploaded: Attachment | null;
  error: string | null;
  preview: string | null;
  controller: AbortController;
}

export interface ComposerHandle {
  setText: (text: string) => void;
  focus: () => void;
}

interface ComposerProps {
  onSend: (content: string, attachments: Attachment[]) => Promise<boolean>;
  onStop: () => void;
  streaming: boolean;
  sendOnEnter: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer({ onSend, onStop, streaming, sendOnEnter, disabled, autoFocus }, ref) {
  const { t } = useT();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  useImperativeHandle(ref, () => ({
    setText: (v: string) => {
      setText(v);
      requestAnimationFrame(() => {
        resize();
        textareaRef.current?.focus();
      });
    },
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    if (autoFocus && window.matchMedia('(min-width: 768px)').matches) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => resize(), [text, resize]);

  // Revoke object URLs on unmount.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      const room = MAX_ATTACHMENTS - filesRef.current.length;
      if (incoming.length > room) toast(`You can attach up to ${MAX_ATTACHMENTS} files per message`, 'error');
      for (const file of incoming.slice(0, Math.max(0, room))) {
        const invalid = validateFile(file);
        if (invalid) {
          toast(invalid, 'error');
          continue;
        }
        const key = `${file.name}-${file.size}-${Math.random()}`;
        const pending: PendingFile = {
          key,
          file,
          progress: 0,
          uploaded: null,
          error: null,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          controller: new AbortController(),
        };
        setFiles((f) => [...f, pending]);
        fileService
          .upload(file, (progress) => setFiles((all) => all.map((p) => (p.key === key ? { ...p, progress } : p))), pending.controller.signal)
          .then(({ file: uploaded }) =>
            setFiles((all) =>
              all.map((p) =>
                p.key === key ? { ...p, progress: 100, uploaded: { id: uploaded.id, name: uploaded.name, kind: uploaded.kind, size: uploaded.size, mimeType: uploaded.mimeType } } : p,
              ),
            ),
          )
          .catch((err: Error) => {
            if (err.name === 'AbortError') return;
            setFiles((all) => all.map((p) => (p.key === key ? { ...p, error: errorMessage(err, 'Upload failed') } : p)));
          });
      }
    },
    [toast],
  );

  const removeFile = (key: string) => {
    const f = files.find((x) => x.key === key);
    if (!f) return;
    f.controller.abort();
    if (f.preview) URL.revokeObjectURL(f.preview);
    if (f.uploaded) void fileService.remove(f.uploaded.id).catch(() => undefined);
    setFiles((all) => all.filter((x) => x.key !== key));
  };

  const uploading = files.some((f) => !f.uploaded && !f.error);
  const hasErrors = files.some((f) => f.error);
  const canSend = !disabled && !streaming && !uploading && !hasErrors && text.trim().length > 0 && text.length <= MAX_CHARS;

  async function submit() {
    if (!canSend) return;
    const content = text.trim();
    const attachments = files.map((f) => f.uploaded!).filter(Boolean);
    const previous = files;
    setText('');
    setFiles([]);
    const ok = await onSend(content, attachments);
    if (!ok) {
      // Restore the draft so nothing typed is lost.
      setText(content);
      setFiles(previous);
    } else previous.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const wantsSend = sendOnEnter ? !e.shiftKey : e.metaKey || e.ctrlKey;
    if (wantsSend) {
      e.preventDefault();
      void submit();
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        'relative rounded-[26px] border bg-surface shadow-soft transition-colors focus-within:border-border-strong',
        dragging ? 'border-accent ring-4 ring-accent-soft' : 'border-border',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((f) => (
            <AttachmentChip
              key={f.key}
              attachment={{ id: f.uploaded?.id, name: f.file.name, kind: f.uploaded?.kind ?? (f.file.type.startsWith('image/') ? 'image' : f.file.name.endsWith('.pdf') ? 'pdf' : 'txt'), size: f.file.size }}
              progress={f.uploaded ? null : f.progress}
              error={f.error}
              localPreview={f.preview}
              onRemove={() => removeFile(f.key)}
              compact
            />
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData.files);
          if (pasted.length) {
            e.preventDefault();
            addFiles(pasted);
          }
        }}
        rows={1}
        placeholder={t('composer.placeholder')}
        aria-label={t('composer.placeholder')}
        disabled={disabled}
        className="scroll-thin block max-h-60 min-h-[52px] w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed text-fg outline-none placeholder:text-muted"
      />
      <div className="flex items-center justify-between px-2.5 pb-2.5">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <IconButton label={t('composer.attach')} onClick={() => fileInputRef.current?.click()} disabled={disabled || files.length >= MAX_ATTACHMENTS}>
            <Paperclip className="h-5 w-5" />
          </IconButton>
          {text.length > MAX_CHARS * 0.9 && (
            <span className={cn('text-xs', text.length > MAX_CHARS ? 'text-danger' : 'text-muted')}>
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          )}
        </div>
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t('composer.stop')}
            title={t('composer.stop')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={t('composer.send')}
            title={t('composer.send')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition-all hover:opacity-85 disabled:bg-border-strong disabled:text-surface disabled:opacity-60"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
});
