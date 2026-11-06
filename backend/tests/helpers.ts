import request from 'supertest';
import { createApp } from '../src/app';
import { registerProvider, AIProviderError, type AIProvider, type CompletionOptions, type StreamChunk } from '../src/services/ai/registry';
import { User } from '../src/models/User';

export const app = createApp();

let counter = 0;
export async function signup(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  counter += 1;
  const creds = { name: `User ${counter}`, email: `user${counter}_${Date.now()}@test.dev`, password: 'Passw0rd!', ...overrides };
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(creds).expect(201);
  return { agent, user: res.body.user as { id: string; email: string; role: string }, creds };
}

export async function signupAdmin() {
  const s = await signup();
  await User.updateOne({ _id: s.user.id }, { role: 'admin' });
  return s;
}

/** Parses an SSE body into a list of { event, data } records. */
export function parseSSE(text: string) {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((b) => b && !b.startsWith(':'))
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? 'message';
      const data = /^data: (.+)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

/** Configurable fake provider standing in for OpenAI (no network). */
export class MockProvider implements AIProvider {
  readonly name = 'openai';
  chunks: string[] = ['Hello', ', ', 'world', '!'];
  failWith: AIProviderError | null = null;
  delayMs = 0;
  calls: CompletionOptions[] = [];
  title = 'Greeting Exchange';

  isConfigured() {
    return true;
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options);
    if (this.failWith) throw this.failWith;
    for (const text of this.chunks) {
      if (options.signal?.aborted) throw new AIProviderError('stopped', 'ABORTED', 499);
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      yield { type: 'delta', text };
    }
    yield { type: 'usage', usage: { promptTokens: 10, completionTokens: this.chunks.length, totalTokens: 10 + this.chunks.length } };
  }

  async complete(options: CompletionOptions) {
    this.calls.push(options);
    return { text: this.title, usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } };
  }
}

export function installMockProvider() {
  const provider = new MockProvider();
  registerProvider(provider);
  return provider;
}
