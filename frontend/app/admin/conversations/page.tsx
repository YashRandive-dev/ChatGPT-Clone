'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Eye, Lock, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/admin/Pagination';
import { Card, Skeleton, Alert, EmptyState, Spinner } from '@/components/ui/Misc';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Markdown } from '@/components/chat/Markdown';
import { useDebounce } from '@/hooks/useDebounce';
import { adminService, type AdminConversationsResponse } from '@/services/adminService';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function AdminConversations() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim(), 300);
  const { data, error, isLoading } = useSWR<AdminConversationsResponse>(adminService.conversationsKey({ page, search: debounced }), { keepPreviousData: true });
  const [viewing, setViewing] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof adminService.getConversation>> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function open(id: string) {
    setViewing(id);
    setDetail(null);
    setDetailError(null);
    try {
      setDetail(await adminService.getConversation(id));
    } catch (err) {
      setDetailError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Conversations" description="Metadata for all conversations. Message content is protected by the privacy setting." />
      {data && !data.contentAccess && (
        <Alert tone="info">
          <Lock className="mr-1.5 inline h-4 w-4" />
          Content access is disabled. Enable “Allow admins to read conversations” under Models &amp; settings to view messages (every access is audit-logged).
        </Alert>
      )}
      <Card className="p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title"
            aria-label="Search conversations"
            className="h-11 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
          />
        </label>
      </Card>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Card className="overflow-hidden p-0">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs font-medium tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-right">Messages</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && !data
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-6" />
                      </td>
                    </tr>
                  ))
                : data?.conversations.map((c) => (
                    <tr key={c.id} className="hover:bg-hover">
                      <td className="max-w-xs truncate px-4 py-3 font-medium text-fg">{c.title}</td>
                      <td className="px-4 py-3 text-muted">{c.user ? `${c.user.name} · ${c.user.email}` : 'Deleted user'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{c.model}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.messageCount}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(c.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" disabled={!data.contentAccess} onClick={() => open(c.id)}>
                          <Eye className="h-4 w-4" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {data && data.conversations.length === 0 && <EmptyState title="No conversations" />}
      </Card>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} size="xl" title={detail?.conversation.title ?? 'Conversation'} description="Read-only view. This access has been recorded in the audit log.">
        {detailError ? (
          <Alert>{detailError}</Alert>
        ) : !detail ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            {detail.messages.map((m) => (
              <div key={m.id} className="rounded-xl border border-border p-3">
                <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
                  {m.role} · {formatDate(m.createdAt)}
                </p>
                {m.role === 'assistant' ? <Markdown content={m.content} /> : <p className="text-sm whitespace-pre-wrap text-fg">{m.content}</p>}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
