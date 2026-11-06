'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, BarChart3, Cpu, LayoutDashboard, MessageSquareText, ThumbsUp, Users } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/conversations', label: 'Conversations', icon: MessageSquareText },
  { href: '/admin/usage', label: 'API usage', icon: BarChart3 },
  { href: '/admin/feedback', label: 'Feedback', icon: ThumbsUp },
  { href: '/admin/settings', label: 'Models & settings', icon: Cpu },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={26} />
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden lg:inline-flex" />
            <Link href="/chat" className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-fg-2 hover:bg-hover hover:text-fg">
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back to chat</span>
            </Link>
          </div>
        </div>
        <nav className="scroll-thin mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Admin sections">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                  active ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
