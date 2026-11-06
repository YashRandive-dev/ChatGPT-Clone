'use client';

import { useState } from 'react';
import { formatNumber } from '@/lib/utils';

/** Minimal dependency-free bar chart with hover readout. */
export function BarChart({ data, valueKey, label }: { data: { date: string; [k: string]: number | string }[]; valueKey: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(1, ...values);
  const active = hover ?? data.length - 1;
  const current = data[active];

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-fg">{label}</p>
        {current && (
          <p className="text-sm text-muted tabular-nums">
            {new Date(current.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}:{' '}
            <span className="font-semibold text-fg">{formatNumber(values[active] ?? 0)}</span>
          </p>
        )}
      </div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label={`${label} per day`} onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={data[i]!.date} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className="w-full rounded-t-[4px] transition-colors"
              style={{ height: `${Math.max(v > 0 ? 3 : 1, (v / max) * 100)}%`, background: i === active ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 35%, transparent)' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{data[0] && new Date(data[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>{data.at(-1) && new Date(data.at(-1)!.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
