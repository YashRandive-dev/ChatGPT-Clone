import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { AIProviderError, type AIProvider, type ChatMessageInput, type CompletionOptions, type StreamChunk, type Usage } from './types';

function toOpenAIMessages(messages: ChatMessageInput[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === 'string' || m.role !== 'user') {
      const text = typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
      return { role: m.role, content: text } as ChatCompletionMessageParam;
    }
    return {
      role: 'user',
      content: m.content.map((p) =>
        p.type === 'text' ? { type: 'text' as const, text: p.text } : { type: 'image_url' as const, image_url: { url: p.dataUrl } },
      ),
    };
  });
}

function mapUsage(u: OpenAI.Completions.CompletionUsage | null | undefined): Usage | null {
  if (!u) return null;
  return { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens };
}

/** Error codes/types OpenAI uses when the account has no credits or hit its spend limit. */
const QUOTA_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached', 'billing_not_active']);

export function normaliseOpenAIError(err: unknown): AIProviderError {
  const normalised = mapOpenAIError(err);
  // Keep the provider's exact wording in the server log for administrators.
  if (normalised.code !== 'ABORTED' && err instanceof Error) logger.warn(`OpenAI error → ${normalised.code}: ${err.message}`);
  return normalised;
}

function mapOpenAIError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;
  if (err instanceof OpenAI.APIUserAbortError || (err instanceof Error && err.name === 'AbortError')) {
    return new AIProviderError('Generation stopped', 'ABORTED', 499);
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIProviderError('The AI provider took too long to respond. Please try again.', 'AI_TIMEOUT', 504);
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new AIProviderError('Could not reach the AI provider. Please try again.', 'AI_UNAVAILABLE', 502);
  }
  if (err instanceof OpenAI.APIError) {
    const code = (err.code ?? '') as string;
    if (err.status === 404 || code === 'model_not_found') {
      return new AIProviderError('The selected model is not available right now. Choose another model.', 'MODEL_UNAVAILABLE', 400);
    }
    if (err.status === 401 || err.status === 403) {
      return new AIProviderError('The AI provider rejected the server credentials. Contact the administrator.', 'AI_AUTH', 503);
    }
    if (err.status === 429) {
      // OpenAI uses 429 both for real rate limits and for an empty/over-limit billing balance.
      const errorBody = (err.error ?? {}) as { code?: string; type?: string };
      const reasons = [code, err.type, errorBody.code, errorBody.type].filter(Boolean).map(String);
      if (reasons.some((r) => QUOTA_CODES.has(r))) {
        return new AIProviderError(
          'The AI service has run out of credits. An administrator needs to add credits to the AI provider account.',
          'AI_QUOTA',
          402,
        );
      }
      return new AIProviderError('The AI provider is rate limiting requests. Try again shortly.', 'AI_RATE_LIMIT', 429);
    }
    if (err.status === 400) {
      return new AIProviderError(`The AI provider rejected the request: ${err.message}`, 'AI_BAD_REQUEST', 400);
    }
    return new AIProviderError('The AI provider returned an error. Please try again.', 'AI_UNAVAILABLE', 502);
  }
  return new AIProviderError('Unexpected AI provider error', 'AI_UNAVAILABLE', 502);
}

/**
 * OpenAI's current parameter is max_completion_tokens; most OpenAI-compatible services
 * (Groq, Gemini, Ollama, OpenRouter, LM Studio…) still expect the classic max_tokens.
 */
function tokenLimit(maxTokens: number) {
  return env.OPENAI_BASE_URL ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens };
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;

  isConfigured() {
    return Boolean(env.OPENAI_API_KEY);
  }

  private getClient(): OpenAI {
    if (!this.isConfigured()) {
      throw new AIProviderError('AI is not configured on the server. Set OPENAI_API_KEY.', 'AI_NOT_CONFIGURED', 503);
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL || undefined,
        timeout: env.AI_TIMEOUT_MS,
        maxRetries: env.AI_MAX_RETRIES,
      });
    }
    return this.client;
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const client = this.getClient();
    try {
      const request = {
        model: options.model,
        messages: toOpenAIMessages(options.messages),
        temperature: options.temperature,
        ...tokenLimit(options.maxTokens),
        stream: true as const,
      };
      const requestOptions = { signal: options.signal, timeout: options.timeoutMs ?? env.AI_TIMEOUT_MS };
      let stream;
      try {
        stream = await client.chat.completions.create({ ...request, stream_options: { include_usage: true } }, requestOptions);
      } catch (err) {
        // Some OpenAI-compatible servers reject stream_options; retry without usage reporting
        // (token counts are then estimated).
        if (!(err instanceof OpenAI.APIError && err.status === 400 && /stream_options|include_usage/i.test(err.message))) throw err;
        stream = await client.chat.completions.create(request, requestOptions);
      }
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        const usage = mapUsage(chunk.usage);
        if (usage) yield { type: 'usage', usage };
      }
    } catch (err) {
      throw normaliseOpenAIError(err);
    }
  }

  async complete(options: CompletionOptions) {
    const client = this.getClient();
    try {
      const res = await client.chat.completions.create(
        {
          model: options.model,
          messages: toOpenAIMessages(options.messages),
          temperature: options.temperature,
          ...tokenLimit(options.maxTokens),
        },
        { signal: options.signal, timeout: options.timeoutMs ?? env.AI_TIMEOUT_MS },
      );
      return { text: res.choices[0]?.message?.content ?? '', usage: mapUsage(res.usage) };
    } catch (err) {
      throw normaliseOpenAIError(err);
    }
  }
}
