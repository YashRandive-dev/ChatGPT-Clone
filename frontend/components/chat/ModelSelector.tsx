'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelOption } from '@/types';

/** Shows models from the backend catalog; unavailable models are listed but disabled. */
export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ModelOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === value);
  const unavailable = value && selected && !selected.available;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || models.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[15px] font-semibold text-fg transition-colors hover:bg-hover disabled:opacity-60"
      >
        <span className="max-w-[46vw] truncate sm:max-w-none">{selected?.label ?? (models.length ? 'Select model' : 'No models')}</span>
        {unavailable && <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger">unavailable</span>}
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 z-40 mt-1 w-72 rounded-2xl border border-border bg-surface p-1.5 shadow-soft"
          >
            {models.map((m) => (
              <li key={m.id}>
                <button
                  role="option"
                  aria-selected={m.id === value}
                  disabled={!m.available}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                      {m.label}
                      {m.vision && <Eye className="h-3.5 w-3.5 text-muted" aria-label="Supports images" />}
                    </span>
                    <span className="block truncate text-xs text-muted">{m.available ? m.description || m.id : 'Currently unavailable'}</span>
                  </span>
                  {m.id === value && <Check className="mt-0.5 h-4 w-4 text-accent" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
