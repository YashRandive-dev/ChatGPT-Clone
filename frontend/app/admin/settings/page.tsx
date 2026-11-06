'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Eye, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/Misc';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { adminService } from '@/services/adminService';
import { errorMessage } from '@/lib/api';
import type { AppSettings, ModelConfig } from '@/types';

type Draft = Omit<AppSettings, 'updatedAt'>;

function NumberField({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; hint?: string }) {
  return <Input label={label} type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} hint={hint} />;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<{ settings: AppSettings; providers: { name: string; configured: boolean }[] }>(adminService.settingsKey);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(structuredClone(data.settings));
  }, [data]);

  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (isLoading || !draft || !data) return <Skeleton className="h-96 rounded-2xl" />;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setModel = (i: number, patch: Partial<ModelConfig>) => set('models', draft.models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const providers = data.providers.map((p) => p.name);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);

  async function save() {
    if (!draft) return;
    setFormError(null);
    if (draft.models.some((m) => !m.id.trim() || !m.label.trim())) {
      setFormError('Every model needs an id and a label.');
      return;
    }
    setSaving(true);
    try {
      const { appName, models, defaultModel, systemPrompt, temperature, maxTokens, maxContextMessages, maxContextTokens, limits, registrationEnabled, allowAdminConversationAccess, aiTitleGeneration } = draft;
      await adminService.updateSettings({
        appName,
        models: models.map(({ id, label, provider, description, enabled, vision, maxOutputTokens }) => ({ id: id.trim(), label: label.trim(), provider, description, enabled, vision, maxOutputTokens })),
        defaultModel,
        systemPrompt,
        temperature,
        maxTokens,
        maxContextMessages,
        maxContextTokens,
        limits: { dailyMessagesPerUser: limits.dailyMessagesPerUser, dailyTokensPerUser: limits.dailyTokensPerUser, aiRequestsPerMinute: limits.aiRequestsPerMinute },
        registrationEnabled,
        allowAdminConversationAccess,
        aiTitleGeneration,
      });
      await mutate();
      toast('Settings saved', 'success');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title="Models & settings" description="Control AI models, prompts, limits and privacy for the whole workspace." />
      {formError && <Alert>{formError}</Alert>}

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-fg">AI models</h2>
            <p className="text-xs text-muted">Model ids must match the provider’s API exactly. Disabled models stay visible but cannot be selected.</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => set('models', [...draft.models, { id: '', label: '', provider: providers[0] ?? 'openai', description: '', enabled: false, vision: false, maxOutputTokens: 4096 }])}
          >
            <Plus className="h-4 w-4" /> Add model
          </Button>
        </div>
        <div className="space-y-3">
          {draft.models.map((m, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input label="Model id" value={m.id} onChange={(e) => setModel(i, { id: e.target.value })} placeholder="e.g. gpt-4o-mini" />
                <Input label="Display name" value={m.label} onChange={(e) => setModel(i, { label: e.target.value })} />
                <Select label="Provider" value={m.provider} onChange={(v) => setModel(i, { provider: v })} options={providers.map((p) => ({ value: p, label: p }))} />
                <NumberField label="Max output tokens" value={m.maxOutputTokens} min={64} max={200000} onChange={(v) => setModel(i, { maxOutputTokens: v })} />
              </div>
              <div className="mt-3">
                <Input label="Description" value={m.description} maxLength={300} onChange={(e) => setModel(i, { description: e.target.value })} placeholder="Shown in the model picker" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
                <div className="w-44">
                  <Switch label="Enabled" checked={m.enabled} onChange={(v) => setModel(i, { enabled: v })} />
                </div>
                <div className="w-52">
                  <Switch label="Supports images" checked={m.vision} onChange={(v) => setModel(i, { vision: v })} />
                </div>
                {draft.defaultModel === m.id && <Badge tone="accent">Default</Badge>}
                {m.vision && <Eye className="h-4 w-4 text-muted" aria-hidden />}
                <IconButton label="Remove model" className="ml-auto" disabled={draft.models.length <= 1} onClick={() => set('models', draft.models.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 max-w-sm">
          <Select
            label="Default model"
            value={draft.defaultModel}
            onChange={(v) => set('defaultModel', v)}
            options={draft.models.filter((m) => m.id).map((m) => ({ value: m.id, label: `${m.label || m.id}${m.enabled ? '' : ' (disabled)'}`, disabled: !m.enabled }))}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold text-fg">Generation</h2>
        <Textarea label="System prompt" rows={6} maxLength={8000} value={draft.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} hint="Sent to the model at the start of every conversation." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Temperature" value={draft.temperature} min={0} max={2} step={0.1} onChange={(v) => set('temperature', v)} />
          <NumberField label="Max response tokens" value={draft.maxTokens} min={64} max={32000} onChange={(v) => set('maxTokens', v)} />
          <NumberField label="Context messages" value={draft.maxContextMessages} min={2} max={200} onChange={(v) => set('maxContextMessages', v)} hint="Recent messages sent as context" />
          <NumberField label="Context token budget" value={draft.maxContextTokens} min={500} max={200000} onChange={(v) => set('maxContextTokens', v)} />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold text-fg">Usage limits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Messages / user / day" value={draft.limits.dailyMessagesPerUser} min={0} max={1_000_000} onChange={(v) => set('limits', { ...draft.limits, dailyMessagesPerUser: v })} hint="0 = unlimited" />
          <NumberField label="Tokens / user / day" value={draft.limits.dailyTokensPerUser} min={0} max={1_000_000_000} onChange={(v) => set('limits', { ...draft.limits, dailyTokensPerUser: v })} hint="0 = unlimited" />
          <NumberField label="AI requests / user / minute" value={draft.limits.aiRequestsPerMinute} min={1} max={10_000} onChange={(v) => set('limits', { ...draft.limits, aiRequestsPerMinute: v })} />
        </div>
        <p className="text-xs text-muted">Administrators are exempt from daily limits.</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold text-fg">Application</h2>
        <div className="mb-3 max-w-sm">
          <Input label="Application name" value={draft.appName} maxLength={60} onChange={(e) => set('appName', e.target.value)} />
        </div>
        <div className="divide-y divide-border">
          <Switch label="Allow new registrations" description="When off, only existing users can sign in." checked={draft.registrationEnabled} onChange={(v) => set('registrationEnabled', v)} />
          <Switch label="AI-generated chat titles" description="Uses one short extra AI call per new conversation." checked={draft.aiTitleGeneration} onChange={(v) => set('aiTitleGeneration', v)} />
          <Switch
            label="Allow admins to read conversations"
            description="Privacy-sensitive. When on, admins can open message content; every access is audit-logged."
            checked={draft.allowAdminConversationAccess}
            onChange={(v) => set('allowAdminConversationAccess', v)}
          />
        </div>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3 sm:px-6">
            <span className="mr-auto text-sm text-muted">You have unsaved changes</span>
            <Button variant="secondary" onClick={() => setDraft(structuredClone(data.settings))}>
              Discard
            </Button>
            <Button onClick={save} loading={saving}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
