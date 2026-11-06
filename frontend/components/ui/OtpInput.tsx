'use client';

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented one-time-code input: auto-advances, supports paste of the full code,
 * Backspace/arrow navigation and the browser's SMS/email one-time-code autofill.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  error,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  function setAt(index: number, chars: string) {
    const clean = chars.replace(/\D/g, '');
    if (!clean) return;
    const next = digits.slice();
    for (let k = 0; k < clean.length && index + k < length; k++) next[index + k] = clean[k]!;
    const joined = next.join('').slice(0, length);
    onChange(joined);
    focus(index + clean.length);
    if (next.slice(0, length).every(Boolean)) onComplete?.(joined);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) next[i] = '';
      else if (i > 0) {
        next[i - 1] = '';
        focus(i - 1);
      }
      onChange(next.join(''));
    } else if (e.key === 'ArrowLeft') focus(i - 1);
    else if (e.key === 'ArrowRight') focus(i + 1);
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (text) setAt(0, text);
  }

  return (
    <div className="flex justify-between gap-2 sm:gap-3" role="group" aria-label={`${length}-digit code`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={length}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={error}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            // Handles typing a digit, replacing an existing one, and OS autofill of the whole code.
            setAt(i, v.length > 1 && d ? v.replace(d, '') || v : v);
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-full min-w-0 rounded-xl border bg-surface text-center font-mono text-2xl font-semibold text-fg transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-60 sm:h-16',
            error ? 'border-danger' : d ? 'border-border-strong' : 'border-border',
          )}
        />
      ))}
    </div>
  );
}
