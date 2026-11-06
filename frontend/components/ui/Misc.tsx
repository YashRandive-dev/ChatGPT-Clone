'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn, initials } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-accent', className)} role="status" aria-label="Loading" />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('relative overflow-hidden rounded-lg bg-surface-2', className)} {...props}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-hover to-transparent" />
  </div>;
}

export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  // Uploaded avatars are served by the API as relative /api/... paths.
  if (src?.startsWith('/api/')) src = `${API_BASE}${src}`;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={cn('brand-gradient inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(name) || '?'}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'danger' | 'success' | 'warning'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-fg-2 border-border',
    accent: 'bg-accent-soft text-accent border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    success: 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success border-transparent',
    warning: 'bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning border-transparent',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function Alert({ tone = 'danger', children, className }: { tone?: 'danger' | 'success' | 'info'; children: ReactNode; className?: string }) {
  const tones = {
    danger: 'border-danger/30 bg-danger-soft text-danger',
    success: 'border-success/30 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-success',
    info: 'border-accent/30 bg-accent-soft text-fg',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-3.5 py-2.5 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
