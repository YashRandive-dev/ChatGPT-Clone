'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Markdown } from '@/components/chat/Markdown';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { EmptyState, Skeleton } from '@/components/ui/Misc';
import { fetcher } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Shared {
  conversation: { title: string; model: string; createdAt: string };
  messages: { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }[];
}

export default function SharedConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<Shared>(`/api/share/${id}`, fetcher);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/80 px-4 py-3 backdrop-blur">
        <Link href="/">
          <Logo size={26} />
        </Link>
        <Link href="/register" className="rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover">
          Try Kairo
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24" />
          </div>
        ) : error || !data ? (
          <EmptyState title="This shared conversation is not available" description="The link may have been disabled by its owner." />
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-fg">{data.conversation.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Shared conversation · {formatDate(data.conversation.createdAt)} · {data.conversation.model}
            </p>
            <div className="mt-8 space-y-6">
              {data.messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl bg-user-bubble px-4 py-2.5 whitespace-pre-wrap text-fg">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <LogoMark size={28} className="shrink-0" />
                    <Markdown content={m.content} className="min-w-0 flex-1" />
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
