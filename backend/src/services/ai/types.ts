export type ChatRole = 'system' | 'user' | 'assistant';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string };

export interface ChatMessageInput {
  role: ChatRole;
  content: string | ContentPart[];
}

export interface CompletionOptions {
  model: string;
  messages: ChatMessageInput[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type StreamChunk = { type: 'delta'; text: string } | { type: 'usage'; usage: Usage };

/**
 * Contract every AI backend implements. Add a new provider (Anthropic, Gemini, a local
 * model server...) by implementing this interface and registering it in registry.ts.
 */
export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  stream(options: CompletionOptions): AsyncIterable<StreamChunk>;
  complete(options: CompletionOptions): Promise<{ text: string; usage: Usage | null }>;
}

/** Normalised provider error so controllers do not depend on SDK error classes. */
export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'MODEL_UNAVAILABLE' | 'AI_AUTH' | 'AI_RATE_LIMIT' | 'AI_QUOTA' | 'AI_TIMEOUT' | 'AI_BAD_REQUEST' | 'AI_UNAVAILABLE' | 'AI_NOT_CONFIGURED' | 'ABORTED',
    readonly status: number,
  ) {
    super(message);
  }
}
