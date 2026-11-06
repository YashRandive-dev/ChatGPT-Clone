'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Share } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { useCopy } from '@/hooks/useCopy';
import { errorMessage } from '@/lib/api';
import { shareConversation } from '@/lib/chatStore';
import { chatService } from '@/services/chatService';

export function ShareDialog({ open, onClose, conversationId }: { open: boolean; onClose: () => void; conversationId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(null);
    shareConversation(conversationId)
      .then(setUrl)
      .catch((err) => setError(errorMessage(err)));
  }, [open, conversationId]);

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <Dialog open={open} onClose={onClose} title="Share conversation" description="Anyone with the link can view a read-only copy of this chat. Attachments are not shared.">
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !url ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-1.5 pl-3">
            <Link2 className="h-4 w-4 shrink-0 text-muted" />
            <input readOnly value={url} className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none" onFocus={(e) => e.target.select()} aria-label="Share link" />
            <Button size="sm" onClick={() => copy(url)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={async () => {
                await chatService.unshare(conversationId);
                toast('Share link disabled', 'success');
                onClose();
              }}
            >
              Disable link
            </Button>
            {canNativeShare && (
              <Button variant="secondary" size="sm" onClick={() => navigator.share({ title: 'Kairo conversation', url }).catch(() => undefined)}>
                <Share className="h-4 w-4" /> Share via…
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
