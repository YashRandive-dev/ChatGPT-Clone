'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/Misc';
import { chatService } from '@/services/chatService';
import { archiveAllConversations, loadConversations, setArchived } from '@/lib/chatStore';
import type { Conversation } from '@/types';
import useSWR from 'swr';
import { Archive, ArchiveRestore, Bell, Download, ExternalLink, Link2, LogOut, Monitor, Settings2, Shield, ShieldCheck, SlidersHorizontal, Trash2, Database, Palette, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Card, Badge, Spinner, Alert } from '@/components/ui/Misc';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { LANGUAGES } from '@/lib/i18n';
import { errorMessage, fetcher } from '@/lib/api';
import { validatePassword } from '@/lib/validation';
import { cn, describeUserAgent, formatDate } from '@/lib/utils';
import { settingsService } from '@/services/settingsService';
import { authService } from '@/services/authService';
import { deleteAllConversations } from '@/lib/chatStore';
import { useUserSettings } from '@/hooks/useUserSettings';
import type { Preferences, Session } from '@/types';

const TABS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'personalization', label: 'Personalization', icon: UserRound },
  { id: 'chat', label: 'Chat & AI', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data controls', icon: Database },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Small segmented control for enum preferences. */
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn('rounded-lg px-3 py-1.5 text-sm transition-colors', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const initialTab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'general';
  const [tab, setTab] = useState<Tab>(initialTab);
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const { data: settings, mutate } = useUserSettings();

  async function savePrefs(patch: Partial<Preferences>) {
    try {
      const res = await settingsService.updatePreferences(patch);
      setUser(res.user);
      void mutate();
      toast('Preferences saved', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  if (!user) return null;
  const prefs = user.preferences;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <PageHeader title="Settings" description="Manage your preferences, security and data." />
        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          <nav className="scroll-thin -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 md:w-48 md:flex-col" aria-label="Settings sections">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  tab === id ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            {tab === 'general' && (
              <Card>
                <Row title="Theme" description="Choose light, dark, or follow your system.">
                  <ThemeToggle onChange={(theme) => savePrefs({ theme })} />
                </Row>
                <Row title="Language" description="Interface language. Kairo will also reply in this language by default.">
                  <div className="w-48">
                    <Select value={prefs.language} onChange={(v) => savePrefs({ language: v as Preferences['language'] })} options={LANGUAGES} />
                  </div>
                </Row>
                <Row title="Show timestamps" description="Display the time and model under each message.">
                  <Switch hideLabel label="Show timestamps" checked={prefs.showTimestamps} onChange={(v) => savePrefs({ showTimestamps: v })} />
                </Row>
                <Row title="Enter to send" description="When off, use Ctrl/⌘ + Enter to send and Enter for a new line.">
                  <Switch hideLabel label="Enter to send" checked={prefs.sendOnEnter} onChange={(v) => savePrefs({ sendOnEnter: v })} />
                </Row>
              </Card>
            )}

            {tab === 'appearance' && (
              <Card>
                <Row title="Font size" description="Scales text across the whole app.">
                  <Segmented
                    label="Font size"
                    value={prefs.fontSize}
                    onChange={(fontSize) => savePrefs({ fontSize })}
                    options={[
                      { value: 'small', label: 'Small' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'large', label: 'Large' },
                    ]}
                  />
                </Row>
                <Row title="Chat width" description="How wide conversations and the message box are on large screens.">
                  <Segmented
                    label="Chat width"
                    value={prefs.chatWidth}
                    onChange={(chatWidth) => savePrefs({ chatWidth })}
                    options={[
                      { value: 'narrow', label: 'Narrow' },
                      { value: 'default', label: 'Default' },
                      { value: 'wide', label: 'Wide' },
                    ]}
                  />
                </Row>
                <Row title="Wrap long code lines" description="Wrap code inside code blocks instead of scrolling sideways.">
                  <Switch hideLabel label="Wrap long code lines" checked={prefs.codeWrap} onChange={(v) => savePrefs({ codeWrap: v })} />
                </Row>
                <Row title="Reduce motion" description="Turn off animations and transitions.">
                  <Switch hideLabel label="Reduce motion" checked={prefs.reduceMotion} onChange={(v) => savePrefs({ reduceMotion: v })} />
                </Row>
              </Card>
            )}

            {tab === 'personalization' && <Personalization prefs={prefs} onSave={savePrefs} />}

            {tab === 'notifications' && (
              <Card>
                <p className="mb-1 text-xs text-muted">Emails are sent to {user.email}.</p>
                <Row title="New sign-in alerts" description="Email me when my account is signed in to from a new browser or device.">
                  <Switch hideLabel label="New sign-in alerts" checked={prefs.notifyNewSignIn} onChange={(v) => savePrefs({ notifyNewSignIn: v })} />
                </Row>
                <Row title="Password change alerts" description="Email me whenever my password is changed or reset.">
                  <Switch hideLabel label="Password change alerts" checked={prefs.notifyPasswordChange} onChange={(v) => savePrefs({ notifyPasswordChange: v })} />
                </Row>
                <Row title="Verification and sign-in codes" description="Always sent — they’re required to verify your email, reset your password and sign in with two-step verification.">
                  <Badge>Always on</Badge>
                </Row>
              </Card>
            )}

            {tab === 'chat' && <ChatPrefs prefs={prefs} models={settings?.models ?? []} onSave={savePrefs} usage={settings?.limits} />}
            {tab === 'security' && (
              <div className="space-y-4">
                <TwoFactorCard />
                <SecuritySettings />
              </div>
            )}
            {tab === 'data' && <DataControls />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPrefs({
  prefs,
  models,
  onSave,
  usage,
}: {
  prefs: Preferences;
  models: { id: string; label: string; available: boolean }[];
  onSave: (p: Partial<Preferences>) => Promise<void>;
  usage?: { dailyMessagesPerUser: number; messagesToday: number };
}) {
  const [temp, setTemp] = useState<number | null>(prefs.temperature);

  return (
    <div className="space-y-4">
      <Card>
        <Row title="Default model" description="Used for new chats. Only models enabled by your administrator are listed.">
          <div className="w-56">
            <Select
              value={prefs.defaultModel ?? ''}
              onChange={(v) => onSave({ defaultModel: v || null })}
              options={[{ value: '', label: 'Workspace default' }, ...models.map((m) => ({ value: m.id, label: m.available ? m.label : `${m.label} (unavailable)`, disabled: !m.available }))]}
            />
          </div>
        </Row>
        <Row title="Auto-generate titles" description="Let the AI name new conversations after the first reply.">
          <Switch hideLabel label="Auto-generate titles" checked={prefs.autoTitle} onChange={(v) => onSave({ autoTitle: v })} />
        </Row>
        <Row title="Auto-scroll while answering" description="Follow the response as it streams in.">
          <Switch hideLabel label="Auto-scroll while answering" checked={prefs.autoScroll} onChange={(v) => onSave({ autoScroll: v })} />
        </Row>
        <Row title="Show token usage" description="Display how many tokens each AI response used.">
          <Switch hideLabel label="Show token usage" checked={prefs.showTokenUsage} onChange={(v) => onSave({ showTokenUsage: v })} />
        </Row>
        <Row title="Suggested prompts" description="Show prompt ideas on the new-chat screen.">
          <Switch hideLabel label="Suggested prompts" checked={prefs.suggestedPrompts} onChange={(v) => onSave({ suggestedPrompts: v })} />
        </Row>
        <Row title="Creativity" description={temp === null ? 'Using the workspace default.' : `Temperature ${temp.toFixed(1)} — lower is more focused, higher is more creative.`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temp ?? 0.7}
              onChange={(e) => setTemp(Number(e.target.value))}
              onMouseUp={() => temp !== null && onSave({ temperature: temp })}
              onTouchEnd={() => temp !== null && onSave({ temperature: temp })}
              onKeyUp={() => temp !== null && onSave({ temperature: temp })}
              aria-label="Temperature"
              className="w-40 accent-[var(--accent)]"
            />
            {temp !== null && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTemp(null);
                  void onSave({ temperature: null });
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </Row>
        {usage && usage.dailyMessagesPerUser > 0 && (
          <Row title="Daily usage" description="Messages sent in the last 24 hours.">
            <Badge tone={usage.messagesToday >= usage.dailyMessagesPerUser ? 'danger' : 'accent'}>
              {usage.messagesToday} / {usage.dailyMessagesPerUser}
            </Badge>
          </Row>
        )}
      </Card>
    </div>
  );
}

function SecuritySettings() {
  const { toast } = useToast();
  const { data, mutate, isLoading } = useSWR<{ sessions: Session[] }>('/api/auth/sessions', fetcher);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const next = {
      current: form.current ? null : 'Current password is required',
      next: validatePassword(form.next),
      confirm: form.next === form.confirm ? null : 'Passwords do not match',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      await settingsService.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast('Password changed. Other devices were signed out.', 'success');
      void mutate();
    } catch (err) {
      setErrors({ current: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-4 font-semibold text-fg">Change password</h2>
        <form onSubmit={changePassword} className="space-y-3" noValidate>
          <Input label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} error={errors.current} />
          <div>
            <Input label="New password" type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} error={errors.next} />
            <PasswordStrength password={form.next} />
          </div>
          <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} error={errors.confirm} />
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-fg">Active sessions</h2>
            <p className="text-xs text-muted">Devices currently signed in to your account.</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await authService.revokeOtherSessions();
              toast('Signed out of all other sessions', 'success');
              void mutate();
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out others
          </Button>
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-border">
            {data?.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Monitor className="h-5 w-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-fg">
                    {describeUserAgent(s.userAgent)} {s.current && <Badge tone="accent">This device</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    {s.ip ?? 'Unknown IP'} · last active {formatDate(s.lastUsedAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await authService.revokeSession(s.id);
                      void mutate();
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DataControls() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmChats, setConfirmChats] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <Row title="Export chat history" description="Download all of your conversations as a JSON file.">
        <Button
          variant="secondary"
          loading={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await settingsService.exportData();
            } catch (err) {
              toast(errorMessage(err), 'error');
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download className="h-4 w-4" /> Export
        </Button>
      </Row>
      <Row title="Archived chats" description="Chats you archived are hidden from the sidebar. Restore or delete them here.">
        <Button variant="secondary" onClick={() => setArchivedOpen(true)}>
          <Archive className="h-4 w-4" /> Manage
        </Button>
      </Row>
      <Row title="Archive all chats" description="Move every conversation out of the sidebar without deleting it.">
        <Button variant="outline" onClick={() => setConfirmArchive(true)}>
          Archive all
        </Button>
      </Row>
      <Row title="Shared links" description="Public read-only links you’ve created. Revoke any of them at any time.">
        <Button variant="secondary" onClick={() => setSharedOpen(true)}>
          <Link2 className="h-4 w-4" /> Manage
        </Button>
      </Row>
      <Row title="Delete all chats" description="Permanently remove every conversation and attachment.">
        <Button variant="outline" className="text-danger" onClick={() => setConfirmChats(true)}>
          <Trash2 className="h-4 w-4" /> Delete all
        </Button>
      </Row>
      <Row title="Delete account" description="Permanently delete your account and all associated data.">
        <Button variant="danger" onClick={() => setConfirmAccount(true)}>
          Delete account
        </Button>
      </Row>

      <ConfirmDialog
        open={confirmChats}
        onClose={() => setConfirmChats(false)}
        loading={busy}
        title="Delete all chats?"
        description="This permanently deletes all of your conversations and uploaded files. This cannot be undone."
        confirmLabel="Delete all chats"
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteAllConversations();
            toast('All chats deleted', 'success');
            setConfirmChats(false);
          } catch (err) {
            toast(errorMessage(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
      <ConfirmDialog
        open={confirmAccount}
        onClose={() => {
          setConfirmAccount(false);
          setPassword('');
          setError(null);
        }}
        loading={busy}
        title="Delete your account?"
        description="Your profile, conversations, files and settings will be permanently erased."
        confirmLabel="Delete my account"
        onConfirm={async () => {
          if (!password) {
            setError('Enter your password to confirm');
            return;
          }
          setBusy(true);
          try {
            await settingsService.deleteAccount(password);
            toast('Your account has been deleted', 'success');
            await logout().catch(() => undefined);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-3 pb-1">
          {error && <Alert>{error}</Alert>}
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </ConfirmDialog>
      <ArchivedChatsDialog open={archivedOpen} onClose={() => setArchivedOpen(false)} />
      <SharedLinksDialog open={sharedOpen} onClose={() => setSharedOpen(false)} />
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        loading={busy}
        danger={false}
        title="Archive all chats?"
        description="Every conversation moves to Archived chats. Nothing is deleted, and you can restore them any time."
        confirmLabel="Archive all"
        onConfirm={async () => {
          setBusy(true);
          try {
            const n = await archiveAllConversations();
            toast(`${n} chat${n === 1 ? '' : 's'} archived`, 'success');
            setConfirmArchive(false);
          } catch (err) {
            toast(errorMessage(err), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

function Personalization({ prefs, onSave }: { prefs: Preferences; onSave: (p: Partial<Preferences>) => Promise<void> }) {
  const initial = { nickname: prefs.nickname, occupation: prefs.occupation, aboutYou: prefs.aboutYou, customInstructions: prefs.customInstructions };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ nickname: prefs.nickname, occupation: prefs.occupation, aboutYou: prefs.aboutYou, customInstructions: prefs.customInstructions }), [prefs.nickname, prefs.occupation, prefs.aboutYou, prefs.customInstructions]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold text-fg">Personalize Kairo</h2>
        <p className="text-xs text-muted">Kairo uses this in every new reply. It’s private to you and never shown to other users.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="What should Kairo call you?" placeholder="e.g. Sam" maxLength={50} value={form.nickname} onChange={set('nickname')} />
        <Input label="What do you do?" placeholder="e.g. Product designer" maxLength={100} value={form.occupation} onChange={set('occupation')} />
      </div>
      <Textarea
        label="Anything else Kairo should know about you?"
        hint={`Interests, values, context for your work… (${form.aboutYou.length}/1500)`}
        rows={4}
        maxLength={1500}
        value={form.aboutYou}
        onChange={set('aboutYou')}
        placeholder="e.g. I'm learning Spanish and live in Pune. I prefer metric units."
      />
      <Textarea
        label="How should Kairo respond?"
        hint={`Tone, format, length… (${form.customInstructions.length}/2000)`}
        rows={4}
        maxLength={2000}
        value={form.customInstructions}
        onChange={set('customInstructions')}
        placeholder="e.g. Be concise. Use bullet points. Show TypeScript examples for code."
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={!dirty} onClick={() => setForm(initial)}>
          Reset
        </Button>
        <Button
          disabled={!dirty}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(form);
            setSaving(false);
          }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function TwoFactorCard() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const enabling = !user.twoFactorEnabled;

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', user.twoFactorEnabled ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="flex items-center gap-2 font-semibold text-fg">
              Two-step verification {user.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
            </p>
            <p className="mt-0.5 text-xs text-muted">After your password, enter a 6-digit code emailed to {user.email} each time you sign in.</p>
            {!user.emailVerified && (
              <p className="mt-1 text-xs text-warning">
                <Link href="/verify-email" className="underline">
                  Verify your email
                </Link>{' '}
                to turn this on.
              </p>
            )}
          </div>
        </div>
        <Button variant={enabling ? 'primary' : 'outline'} disabled={enabling && !user.emailVerified} onClick={() => setOpen(true)}>
          {enabling ? 'Turn on' : 'Turn off'}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setPassword('');
          setError(null);
        }}
        loading={busy}
        danger={!enabling}
        title={enabling ? 'Turn on two-step verification?' : 'Turn off two-step verification?'}
        description={enabling ? 'You’ll need a code from your email every time you sign in.' : 'Your account will be protected by your password only.'}
        confirmLabel={enabling ? 'Turn on' : 'Turn off'}
        onConfirm={async () => {
          if (!password) {
            setError('Enter your password to confirm');
            return;
          }
          setBusy(true);
          try {
            const res = await settingsService.setTwoFactor(enabling, password);
            setUser(res.user);
            toast(enabling ? 'Two-step verification is on' : 'Two-step verification is off', 'success');
            setOpen(false);
            setPassword('');
            setError(null);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-3 pb-1">
          {error && <Alert>{error}</Alert>}
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </ConfirmDialog>
    </Card>
  );
}

function ArchivedChatsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data, mutate, isLoading } = useSWR<{ conversations: Conversation[] }>(open ? '/api/conversations?archived=true&limit=100' : null, fetcher);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, kind: 'restore' | 'delete') {
    setBusyId(id);
    try {
      if (kind === 'restore') {
        await setArchived(id, false);
        toast('Chat restored to the sidebar', 'success');
      } else {
        await chatService.deleteConversation(id);
        toast('Chat deleted', 'success');
      }
      await mutate();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Archived chats" description="Archived chats are kept but hidden from the sidebar and search.">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !data?.conversations.length ? (
        <EmptyState icon={<Archive className="h-7 w-7" />} title="No archived chats" description="Use “Archive” in a chat’s menu to tidy up your sidebar." />
      ) : (
        <ul className="-mx-2 divide-y divide-border pb-2">
          {data.conversations.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-2 py-2.5">
              <Link href={`/chat/${c.id}`} onClick={onClose} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg hover:underline">{c.title}</span>
                <span className="text-xs text-muted">{formatDate(c.updatedAt)}</span>
              </Link>
              <Button size="sm" variant="ghost" loading={busyId === c.id} onClick={() => act(c.id, 'restore')}>
                <ArchiveRestore className="h-4 w-4" /> Restore
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" disabled={busyId === c.id} onClick={() => act(c.id, 'delete')} aria-label={`Delete ${c.title}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function SharedLinksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data, mutate, isLoading } = useSWR<{ conversations: Conversation[] }>(open ? '/api/conversations/shared' : null, fetcher);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Shared links"
      description="Anyone with one of these links can read that conversation."
      footer={
        data?.conversations.length ? (
          <Button
            variant="outline"
            className="text-danger"
            onClick={async () => {
              const res = await chatService.revokeAllShared();
              toast(`${res.revoked} link${res.revoked === 1 ? '' : 's'} revoked`, 'success');
              await mutate();
              void loadConversations(true);
            }}
          >
            Revoke all
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !data?.conversations.length ? (
        <EmptyState icon={<Link2 className="h-7 w-7" />} title="No shared links" description="Share a chat from its menu to create a public read-only link." />
      ) : (
        <ul className="-mx-2 divide-y divide-border pb-2">
          {data.conversations.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{c.title}</span>
                <span className="text-xs text-muted">Updated {formatDate(c.updatedAt)}</span>
              </span>
              <a href={`/share/${c.shareId}`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-muted hover:bg-hover hover:text-fg" aria-label={`Open shared link for ${c.title}`}>
                <ExternalLink className="h-4 w-4" />
              </a>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={async () => {
                  await chatService.unshare(c.id);
                  toast('Link revoked', 'success');
                  await mutate();
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
