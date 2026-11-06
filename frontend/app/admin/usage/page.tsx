'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/layout/PageHeader';
import { BarChart } from '@/components/admin/BarChart';
import { Card, Skeleton, Alert, EmptyState } from '@/components/ui/Misc';
import { Select } from '@/components/ui/Input';
import { adminService, type UsageResponse } from '@/services/adminService';
import { errorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

export default function AdminUsage() {
  const [days, setDays] = useState('30');
  const { data, error, isLoading } = useSWR<UsageResponse>(adminService.usageKey(Number(days)));

  return (
    <div className="space-y-4">
      <PageHeader
        title="API usage"
        description="Requests and tokens sent to AI providers."
        actions={
          <div className="w-40">
            <Select value={days} onChange={setDays} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
          </div>
        }
      />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {isLoading || !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <BarChart data={data.daily} valueKey="requests" label="Requests per day" />
            </Card>
            <Card>
              <BarChart data={data.daily} valueKey="tokens" label="Tokens per day" />
            </Card>
          </div>
          <Card className="overflow-hidden p-0">
            <h2 className="px-4 pt-4 font-semibold text-fg">By model</h2>
            {data.byModel.length === 0 ? (
              <EmptyState title="No usage in this period" />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="mt-2 w-full min-w-[640px] text-sm">
                  <thead className="border-y border-border bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Model</th>
                      <th className="px-4 py-2.5 text-right">Requests</th>
                      <th className="px-4 py-2.5 text-right">Prompt tokens</th>
                      <th className="px-4 py-2.5 text-right">Completion tokens</th>
                      <th className="px-4 py-2.5 text-right">Errors</th>
                      <th className="px-4 py-2.5 text-right">Avg latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {data.byModel.map((m) => (
                      <tr key={m.model}>
                        <td className="px-4 py-2.5 font-mono text-xs text-fg">{m.model}</td>
                        <td className="px-4 py-2.5 text-right">{formatNumber(m.requests)}</td>
                        <td className="px-4 py-2.5 text-right">{formatNumber(m.promptTokens)}</td>
                        <td className="px-4 py-2.5 text-right">{formatNumber(m.completionTokens)}</td>
                        <td className="px-4 py-2.5 text-right">{m.errors}</td>
                        <td className="px-4 py-2.5 text-right">{(m.avgLatencyMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card className="overflow-hidden p-0">
            <h2 className="px-4 pt-4 font-semibold text-fg">Top users</h2>
            {data.topUsers.length === 0 ? (
              <EmptyState title="No usage in this period" />
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {data.topUsers.map((u, i) => (
                  <li key={u.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-5 text-muted tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-fg">{u.name}</span> <span className="text-muted">{u.email}</span>
                    </span>
                    <span className="text-muted tabular-nums">{formatNumber(u.requests)} req</span>
                    <span className="w-24 text-right font-medium text-fg tabular-nums">{formatNumber(u.tokens)} tok</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
