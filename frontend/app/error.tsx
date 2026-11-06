'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-warning" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">{error.message || 'An unexpected error occurred.'}</p>
      <button onClick={reset} className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-hover">
        Try again
      </button>
    </main>
  );
}
