'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/admin/Pagination';
import { Card, Skeleton, Alert, EmptyState, Badge } from '@/components/ui/Misc';
import { Select } from '@/components/ui/Input';
import { adminService, type FeedbackResponse } from '@/services/adminService';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function AdminFeedback() {
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useSWR<FeedbackResponse>(adminService.feedbackKey({ page, rating }), { keepPreviousData: true });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Feedback"
        description="Ratings users gave to AI responses."
        actions={
          <div className="w-40">
            <Select value={rating} onChange={(v) => { setRating(v); setPage(1); }} options={[{ value: '', label: 'All ratings' }, { value: 'like', label: 'Likes' }, { value: 'dislike', label: 'Dislikes' }]} />
          </div>
        }
      />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {isLoading && !data ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : data?.feedback.length === 0 ? (
        <Card>
          <EmptyState title="No feedback yet" />
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.feedback.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {f.rating === 'like' ? (
                  <Badge tone="success">
                    <ThumbsUp className="h-3.5 w-3.5" /> Like
                  </Badge>
                ) : (
                  <Badge tone="danger">
                    <ThumbsDown className="h-3.5 w-3.5" /> Dislike
                  </Badge>
                )}
                <span className="font-medium text-fg">{f.user?.name ?? 'Deleted user'}</span>
                <span className="text-muted">{f.user?.email}</span>
                <span className="ml-auto text-xs text-muted">
                  {f.model && <span className="mr-2 font-mono">{f.model}</span>}
                  {formatDate(f.createdAt)}
                </span>
              </div>
              {f.comment && <p className="mt-2 text-sm text-fg">“{f.comment}”</p>}
              {f.excerpt && <p className="mt-2 line-clamp-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">{f.excerpt}</p>}
            </Card>
          ))}
        </div>
      )}
      {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </div>
  );
}
