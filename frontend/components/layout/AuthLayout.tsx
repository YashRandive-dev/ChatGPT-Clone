'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/ui/Logo';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          </motion.div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <div className="brand-gradient absolute inset-0 opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_45%)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <blockquote className="max-w-md text-2xl leading-snug font-medium">
            “The best way to have a good idea is to have a lot of ideas.”
          </blockquote>
          <p className="mt-3 text-white/80">— Linus Pauling</p>
          <div className="mt-10 space-y-3">
            {['Explain this stack trace', 'Draft a launch announcement', 'Summarise this PDF'].map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="w-fit rounded-2xl bg-white/15 px-4 py-2.5 text-sm backdrop-blur"
              >
                {s}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
