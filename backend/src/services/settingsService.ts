import { AppSettings, type IAppSettings, type ModelConfig } from '../models/AppSettings';
import { env } from '../config/env';

const CACHE_TTL_MS = 30_000;
let cache: { value: IAppSettings; at: number } | null = null;

/** Parses AI_MODELS ("id|Label|vision,id2|Label2|false") into model configs. */
export function parseModelsFromEnv(raw: string = env.AI_MODELS): ModelConfig[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, label, vision] = entry.split('|').map((s) => s?.trim());
      return {
        id: id!,
        label: label || id!,
        provider: 'openai',
        description: '',
        enabled: true,
        vision: vision === 'true',
        maxOutputTokens: 4096,
      };
    });
}

/** Returns the singleton settings document, creating it from env defaults on first boot. */
export async function getSettings(fresh = false): Promise<IAppSettings> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  let doc = await AppSettings.findOne({ key: 'global' }).lean<IAppSettings>();
  if (!doc) {
    const models = parseModelsFromEnv();
    const defaultModel = models.find((m) => m.id === env.AI_DEFAULT_MODEL)?.id ?? models[0]?.id ?? env.AI_DEFAULT_MODEL;
    await AppSettings.updateOne(
      { key: 'global' },
      { $setOnInsert: { key: 'global', models, defaultModel, modelsSource: env.AI_MODELS } },
      { upsert: true },
    );
    doc = await AppSettings.findOne({ key: 'global' }).lean<IAppSettings>();
  }
  cache = { value: doc!, at: Date.now() };
  return doc!;
}

/**
 * Called on startup. When AI_MODELS in .env has changed since the catalog was last synced
 * (e.g. after switching from OpenAI to Ollama, or pointing at another database), replace the
 * stored model list with the one from .env. Edits made in the admin panel are kept as long as
 * AI_MODELS stays the same.
 */
export async function syncModelsFromEnv(): Promise<{ changed: boolean; models: string[] }> {
  const current = await getSettings(true);
  if (current.modelsSource === env.AI_MODELS) return { changed: false, models: current.models.map((m) => m.id) };
  const models = parseModelsFromEnv();
  if (!models.length) return { changed: false, models: current.models.map((m) => m.id) };
  const defaultModel = models.find((m) => m.id === env.AI_DEFAULT_MODEL)?.id ?? models[0]!.id;
  const updated = await updateSettings({ models, defaultModel, modelsSource: env.AI_MODELS });
  return { changed: true, models: updated.models.map((m) => m.id) };
}

export async function updateSettings(patch: Partial<IAppSettings>): Promise<IAppSettings> {
  await getSettings(true);
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'limits' && v && typeof v === 'object') {
      for (const [lk, lv] of Object.entries(v)) flat[`limits.${lk}`] = lv;
    } else flat[k] = v;
  }
  const doc = await AppSettings.findOneAndUpdate({ key: 'global' }, { $set: flat }, { returnDocument: 'after', runValidators: true }).lean<IAppSettings>();
  cache = { value: doc!, at: Date.now() };
  return doc!;
}

export function invalidateSettingsCache() {
  cache = null;
}

export function enabledModels(settings: IAppSettings): ModelConfig[] {
  return settings.models.filter((m) => m.enabled);
}

/** Resolves the requested model to an enabled one, or null when not available. */
export function resolveModel(settings: IAppSettings, requested?: string | null): ModelConfig | null {
  const available = enabledModels(settings);
  if (requested) return available.find((m) => m.id === requested) ?? null;
  return available.find((m) => m.id === settings.defaultModel) ?? available[0] ?? null;
}

export function publicModelList(settings: IAppSettings) {
  return {
    defaultModel: resolveModel(settings)?.id ?? null,
    models: settings.models.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      provider: m.provider,
      vision: m.vision,
      available: m.enabled,
    })),
  };
}
