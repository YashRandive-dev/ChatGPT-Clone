'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Archive,
  BadgeCheck,
  CalendarDays,
  Camera,
  Coins,
  FileText,
  KeyRound,
  Lock,
  Link2,
  Loader2,
  MailWarning,
  MessageSquare,
  MessagesSquare,
  ShieldCheck,
  ShieldOff,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Avatar, Badge, Alert, Skeleton } from '@/components/ui/Misc';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { BarChart } from '@/components/admin/BarChart';
import { useAuth } from '@/lib/auth';
import { errorMessage, ApiError, fetcher } from '@/lib/api';
import { validateEmail } from '@/lib/validation';
import { formatDate, formatNumber } from '@/lib/utils';
import { settingsService } from '@/services/settingsService';
import type { UserStats } from '@/types';

const MAX_AVATAR_MB = 2;

function Stat({ icon: Icon, label, value, hint }: { icon: typeof MessageSquare; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-fg tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { data: stats, isLoading: statsLoading } = useSWR<UserStats>('/api/users/me/stats', fetcher);
  const [form, setForm] = useState({ name: '', email: '', currentPassword: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) setForm({ name: user.name, email: user.email, currentPassword: '' });
  }, [user]);

  if (!user) return null;
  const emailChanged = !user.emailVerified && form.email.trim().toLowerCase() !== user.email;

  async function onAvatarPicked(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      toast('Choose a PNG, JPG, WEBP or GIF image', 'error');
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast(`Images must be ${MAX_AVATAR_MB} MB or smaller`, 'error');
      return;
    }
    setAvatarProgress(0);
    try {
      const res = await settingsService.uploadAvatar(file, setAvatarProgress);
      setUser(res.user);
      toast('Profile photo updated', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setAvatarProgress(null);
    }
  }

  async function removeAvatar() {
    try {
      const res = await settingsService.removeAvatar();
      setUser(res.user);
      toast('Profile photo removed', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const next = {
      name: form.name.trim() ? null : 'Name is required',
      email: validateEmail(form.email),
      currentPassword: emailChanged && !form.currentPassword ? 'Enter your password to change your email' : null,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const body: Parameters<typeof settingsService.updateProfile>[0] = {};
    if (form.name.trim() !== user.name) body.name = form.name.trim();
    if (emailChanged) {
      body.email = form.email.trim();
      body.currentPassword = form.currentPassword;
    }
    if (!Object.keys(body).length) {
      toast('Nothing to update', 'info');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await settingsService.updateProfile(body);
      setUser(res.user);
      if (res.emailChanged) {
        toast('Email updated. Enter the 6-digit code we sent to your new address.', 'success');
        router.push('/verify-email?sent=1&next=/profile');
      } else toast('Profile saved', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors((x) => ({ ...x, email: err.message }));
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <PageHeader title="Profile" description="Your account, activity and security at a glance." />

        {/* Identity */}
        <Card className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative block rounded-full focus-visible:outline-offset-4"
              aria-label="Change profile photo"
              disabled={avatarProgress !== null}
            >
              <Avatar name={user.name} src={user.avatar} size={88} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="h-6 w-6" />
              </span>
              {avatarProgress !== null && (
                <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/55 text-xs font-medium text-white">
                  <Loader2 className="mb-1 h-5 w-5 animate-spin" />
                  {avatarProgress}%
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => {
              void onAvatarPicked(e.target.files?.[0]);
              e.target.value = '';
            }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold text-fg">{user.name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-2 sm:justify-start">
              {user.emailVerified ? (
                <Badge tone="success">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified
                </Badge>
              ) : (
                <Badge tone="warning">
                  <MailWarning className="h-3.5 w-3.5" /> Email not verified
                </Badge>
              )}
              {user.twoFactorEnabled && (
                <Badge tone="accent">
                  <ShieldCheck className="h-3.5 w-3.5" /> Two-step on
                </Badge>
              )}
              {user.role === 'admin' && <Badge tone="accent">Administrator</Badge>}
              <Badge>
                <CalendarDays className="h-3.5 w-3.5" /> Joined {formatDate(user.createdAt)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={avatarProgress !== null}>
                <Camera className="h-4 w-4" /> {user.avatar ? 'Change photo' : 'Upload photo'}
              </Button>
              {user.avatar && (
                <Button size="sm" variant="ghost" onClick={removeAvatar}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
              {!user.emailVerified && (
                <Link href="/verify-email" className="inline-flex h-8 items-center rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover">
                  Verify email
                </Link>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">PNG, JPG, WEBP or GIF, up to {MAX_AVATAR_MB} MB.</p>
          </div>
        </Card>

        {/* Activity */}
        <Card>
          <h2 className="mb-4 font-semibold text-fg">Your activity</h2>
          {statsLoading || !stats ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={MessagesSquare} label="Conversations" value={formatNumber(stats.conversations)} hint={stats.archived ? `${stats.archived} archived` : undefined} />
                <Stat icon={MessageSquare} label="Messages sent" value={formatNumber(stats.sentMessages)} hint={`${formatNumber(stats.messages)} total`} />
                <Stat icon={Coins} label="Tokens used" value={formatNumber(stats.tokens.total)} hint={`${formatNumber(stats.tokens.last30Days)} in 30 days`} />
                <Stat icon={CalendarDays} label="Active days" value={stats.activeDays30} hint="in the last 30 days" />
                <Stat icon={FileText} label="Files uploaded" value={stats.files} />
                <Stat icon={Link2} label="Shared links" value={stats.shared} />
                <Stat icon={ThumbsUp} label="Ratings given" value={stats.feedback.likes + stats.feedback.dislikes} hint={`${stats.feedback.likes} 👍 · ${stats.feedback.dislikes} 👎`} />
                <Stat icon={Archive} label="Archived" value={stats.archived} />
              </div>
              <div className="mt-6">
                <BarChart data={stats.activity} valueKey="messages" label="Messages sent · last 30 days" />
              </div>
            </>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Account details */}
          <Card className="lg:col-span-3">
            <h2 className="mb-4 font-semibold text-fg">Account details</h2>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {formError && <Alert>{formError}</Alert>}
              <Input label="Display name" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} />
              {user.emailVerified ? (
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-fg-2">Email</span>
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 text-[15px] text-fg">
                    <Lock className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{user.email}</span>
                    <Badge tone="success">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">Your email is verified and permanently linked to this account, so it can’t be changed.</p>
                </div>
              ) : (
                <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} hint="You can fix your email until it’s verified. After that it can’t be changed." />
              )}
              {emailChanged && (
                <Input
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  error={errors.currentPassword}
                />
              )}
              <div className="flex justify-end">
                <Button type="submit" loading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          {/* Security summary */}
          <Card className="lg:col-span-2">
            <h2 className="mb-4 font-semibold text-fg">Security</h2>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                {user.twoFactorEnabled ? <ShieldCheck className="mt-0.5 h-4 w-4 text-success" /> : <ShieldOff className="mt-0.5 h-4 w-4 text-warning" />}
                <span>
                  <span className="block font-medium text-fg">Two-step verification</span>
                  <span className="text-muted">{user.twoFactorEnabled ? 'On — a code is emailed at each sign-in.' : 'Off — turn it on for extra protection.'}</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-4 w-4 text-muted" />
                <span>
                  <span className="block font-medium text-fg">Password</span>
                  <span className="text-muted">{user.passwordChangedAt ? `Last changed ${formatDate(user.passwordChangedAt)}` : 'Never changed since sign-up'}</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                {user.emailVerified ? <BadgeCheck className="mt-0.5 h-4 w-4 text-success" /> : <MailWarning className="mt-0.5 h-4 w-4 text-warning" />}
                <span>
                  <span className="block font-medium text-fg">Email</span>
                  <span className="text-muted">{user.emailVerified ? 'Verified' : 'Not verified yet'}</span>
                </span>
              </li>
            </ul>
            <Link href="/settings?tab=security" className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-xl border border-border text-sm font-medium text-fg hover:bg-hover">
              Manage security
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
