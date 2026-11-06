'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Kairo mark: a four-point spark inside a rounded tile. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  // Unique gradient id per instance: a shared id breaks when the first copy is display:none.
  const gid = `kairo-g-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14b8a6" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <path d="M16 6.5c.6 4.9 4.6 8.9 9.5 9.5-4.9.6-8.9 4.6-9.5 9.5-.6-4.9-4.6-8.9-9.5-9.5 4.9-.6 8.9-4.6 9.5-9.5Z" fill="#fff" />
      <circle cx="23.5" cy="8.5" r="1.6" fill="#fff" fillOpacity=".75" />
    </svg>
  );
}

export function Logo({ className, size = 28, showText = true }: { className?: string; size?: number; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      {showText && <span className="text-lg font-semibold tracking-tight text-fg">Kairo</span>}
    </span>
  );
}
