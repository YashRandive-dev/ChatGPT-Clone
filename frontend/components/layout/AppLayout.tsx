'use client';

import type { ReactNode } from 'react';
import { RequireAuth } from './RequireAuth';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { VerifyBanner } from './VerifyBanner';

/** Authenticated app frame shared by chat, settings, profile and help. */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>
        <div className="flex h-full flex-col">
          <VerifyBanner />
          <div className="min-h-0 flex-1">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
