'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Ban, MoreHorizontal, Search, ShieldCheck, ShieldOff, Trash2, UserCheck, BadgeCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pagination } from '@/components/admin/Pagination';
import { Card, Avatar, Badge, Skeleton, Alert, EmptyState } from '@/components/ui/Misc';
import { Select } from '@/components/ui/Input';
import { Menu } from '@/components/ui/Menu';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth';
import { adminService, type UsersResponse } from '@/services/adminService';
import { errorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/utils';
import type { AdminUser } from '@/types';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim(), 300);
  const key = adminService.usersKey({ search: debounced, page, role, status });
  const { data, error, isLoading, mutate } = useSWR<UsersResponse>(key, { keepPreviousData: true });
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  async function update(u: AdminUser, body: Parameters<typeof adminService.updateUser>[1], message: string) {
    try {
      await adminService.updateUser(u.id, body);
      toast(message, 'success');
      void mutate();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Users" description="Search, block, promote or remove accounts." />
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email"
              aria-label="Search users"
              className="h-11 w-full rounded-xl border border-border bg-surface pr-3 pl-9 text-sm text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:w-80">
            <Select value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[{ value: '', label: 'All roles' }, { value: 'user', label: 'Users' }, { value: 'admin', label: 'Admins' }]} />
            <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'blocked', label: 'Blocked' }]} />
          </div>
        </div>
      </Card>

      {error && <Alert>{errorMessage(error)}</Alert>}
      <Card className="overflow-hidden p-0">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-surface-2 text-left text-xs font-medium tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Chats</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && !data
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-4 py-3">
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))
                : data?.users.map((u) => (
                    <tr key={u.id} className="hover:bg-hover">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar} size={32} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 truncate font-medium text-fg">
                              {u.name} {u.emailVerified && <BadgeCheck className="h-3.5 w-3.5 text-accent" aria-label="Verified" />}
                            </p>
                            <p className="truncate text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{u.role === 'admin' ? <Badge tone="accent">Admin</Badge> : <Badge>User</Badge>}</td>
                      <td className="px-4 py-3">{u.blocked ? <Badge tone="danger">Blocked</Badge> : <Badge tone="success">Active</Badge>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{u.conversationCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNumber(u.tokensUsed)}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(u.lastActiveAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {u.id !== me?.id && (
                          <Menu
                            trigger={({ toggle }) => (
                              <button onClick={toggle} aria-label={`Actions for ${u.name}`} className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-fg">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            )}
                            items={[
                              u.blocked
                                ? { label: 'Unblock', icon: <UserCheck className="h-4 w-4" />, onSelect: () => update(u, { blocked: false }, `${u.name} unblocked`) }
                                : { label: 'Block', icon: <Ban className="h-4 w-4" />, onSelect: () => update(u, { blocked: true }, `${u.name} blocked`) },
                              u.role === 'admin'
                                ? { label: 'Remove admin', icon: <ShieldOff className="h-4 w-4" />, onSelect: () => update(u, { role: 'user' }, `${u.name} is now a user`) }
                                : { label: 'Make admin', icon: <ShieldCheck className="h-4 w-4" />, onSelect: () => update(u, { role: 'admin' }, `${u.name} is now an admin`) },
                              ...(!u.emailVerified ? [{ label: 'Mark email verified', icon: <BadgeCheck className="h-4 w-4" />, onSelect: () => update(u, { emailVerified: true }, 'Email marked as verified') }] : []),
                              'separator' as const,
                              { label: 'Delete user', icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setToDelete(u) },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {data && data.users.length === 0 && <EmptyState title="No users found" description="Try a different search or filter." />}
      </Card>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        loading={busy}
        title="Delete user?"
        description={`This permanently deletes ${toDelete?.name ?? 'this user'} (${toDelete?.email ?? ''}) with all conversations, files and usage history.`}
        confirmLabel="Delete user"
        onConfirm={async () => {
          if (!toDelete) return;
          setBusy(true);
          try {
            await adminService.deleteUser(toDelete.id);
            toast('User deleted', 'success');
            setToDelete(null);
            void mutate();
          } catch (err) {
            toast(errorMessage(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
