import { OpenAIProvider } from './openaiProvider';
import { AIProviderError, type AIProvider } from './types';

const providers = new Map<string, AIProvider>();
providers.set('openai', new OpenAIProvider());

/** Register or replace a provider (used for new integrations and for mocking in tests). */
export function registerProvider(provider: AIProvider) {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): AIProvider {
  const provider = providers.get(name);
  if (!provider) throw new AIProviderError(`AI provider "${name}" is not supported`, 'MODEL_UNAVAILABLE', 400);
  return provider;
}

export function listProviders() {
  return [...providers.values()].map((p) => ({ name: p.name, configured: p.isConfigured() }));
}

export * from './types';
