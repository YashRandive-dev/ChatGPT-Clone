'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MailWarning, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function VerifyBanner() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  if (!user || user.emailVerified || hidden) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent-soft px-4 py-2 text-sm text-fg">
      <MailWarning className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">Verify your email address ({user.email}) with the 6-digit code we sent you.</span>
      <Link href="/verify-email" className="shrink-0 font-medium text-accent hover:underline">
        Verify now
      </Link>
      <button onClick={() => setHidden(true)} aria-label="Dismiss" className="shrink-0 text-muted hover:text-fg">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
