'use client';

import useSWR from 'swr';
import { Activity, AlertTriangle, Coins, MessageSquare, MessagesSquare, ThumbsDown, ThumbsUp, UserCheck, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { BarChart } from '@/components/admin/BarChart';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/Misc';
import { adminService, type DashboardResponse } from '@/services/adminService';
import { formatNumber } from '@/lib/utils';
import { errorMessage } from '@/lib/api';

export default function AdminOverview() {
  const { data, error, isLoading } = useSWR<DashboardResponse>(adminService.dashboardKey, { refreshInterval: 60_000 });

  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (isLoading || !data)
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );

  const s = data.stats;
  const satisfaction = s.likes + s.dislikes > 0 ? Math.round((s.likes / (s.likes + s.dislikes)) * 100) : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Platform health at a glance. Refreshes every minute." />
      {data.providers.some((p) => !p.configured) && (
        <Alert>
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          AI provider not configured: {data.providers.filter((p) => !p.configured).map((p) => p.name).join(', ')}. Set the API key on the server.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={formatNumber(s.totalUsers)} hint={`+${s.newUsers7d} in the last 7 days`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active users" value={formatNumber(s.activeUsers24h)} hint={`${s.activeUsers7d} active this week`} icon={<UserCheck className="h-4 w-4" />} />
        <StatCard label="Conversations" value={formatNumber(s.totalConversations)} icon={<MessagesSquare className="h-4 w-4" />} />
        <StatCard label="Messages" value={formatNumber(s.totalMessages)} hint={`${s.messages24h} in the last 24h`} icon={<MessageSquare className="h-4 w-4" />} />
        <StatCard label="AI requests" value={formatNumber(s.aiRequests)} hint={`${s.aiRequests30d} in 30 days · ${s.aiErrors} errors`} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Tokens consumed" value={formatNumber(s.totalTokens)} hint={`${formatNumber(s.promptTokens)} in · ${formatNumber(s.completionTokens)} out`} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Positive feedback" value={s.likes} hint={satisfaction !== null ? `${satisfaction}% satisfaction` : 'No ratings yet'} icon={<ThumbsUp className="h-4 w-4" />} />
        <StatCard label="Negative feedback" value={s.dislikes} hint={`${s.blockedUsers} blocked users`} icon={<ThumbsDown className="h-4 w-4" />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BarChart data={data.daily} valueKey="requests" label="AI requests · last 14 days" />
        </Card>
        <Card>
          <BarChart data={data.daily} valueKey="tokens" label="Tokens · last 14 days" />
        </Card>
      </div>
      <Card>
        <p className="mb-3 text-sm font-medium text-fg">AI providers</p>
        <div className="flex flex-wrap gap-2">
          {data.providers.map((p) => (
            <Badge key={p.name} tone={p.configured ? 'success' : 'danger'}>
              {p.name}: {p.configured ? 'configured' : 'missing API key'}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
