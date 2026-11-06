'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Misc';
import { useDebounce } from '@/hooks/useDebounce';
import { chatService } from '@/services/chatService';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Conversation } from '@/types';

/** Debounced server-side search across conversation titles and message content. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 300);
  const [results, setResults] = useState<Conversation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    chatService
      .listConversations({ search: debounced || undefined, limit: 20 }, controller.signal)
      .then((r) => {
        setResults(r.conversations);
        setHighlight(0);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setError(errorMessage(err));
      })
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [debounced, open]);

  const go = (c: Conversation) => {
    onClose();
    router.push(`/chat/${c.id}`);
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" className="sm:mt-[-10vh]">
      <div className="-mx-5 -mt-3 flex items-center gap-3 border-b border-border px-5 py-3">
        <Search className="h-5 w-5 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (!results?.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') go(results[highlight]!);
          }}
          placeholder={t('sidebar.search')}
          aria-label={t('sidebar.search')}
          className="h-10 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
        />
        {loading && <Spinner className="h-4 w-4" />}
      </div>
      <div className="-mx-2 min-h-[200px] py-2">
        {error && <p className="px-3 py-6 text-center text-sm text-danger">{error}</p>}
        {results && results.length === 0 && !loading && <p className="px-3 py-10 text-center text-sm text-muted">No chats match “{debounced}”.</p>}
        <ul role="listbox">
          {results?.map((c, i) => (
            <li key={c.id}>
              <button
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => go(c)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === highlight ? 'bg-hover' : ''}`}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{c.title}</span>
                <span className="shrink-0 text-xs text-muted">{formatDate(c.updatedAt, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
