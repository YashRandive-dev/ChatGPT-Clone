import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { app, installMockProvider, MockProvider, parseSSE, signup } from './helpers';
import { AIProviderError } from '../src/services/ai/registry';
import { Message } from '../src/models/Message';
import { Conversation } from '../src/models/Conversation';
import { UsageLog } from '../src/models/UsageLog';
import { Feedback } from '../src/models/Feedback';
import { updateSettings } from '../src/services/settingsService';

type Agent = ReturnType<typeof request.agent>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collect = (r: any, cb: (err: Error | null, body: string) => void) => {
  let data = '';
  r.on('data', (c: Buffer) => (data += c.toString()));
  r.on('end', () => cb(null, data));
};

async function stream(agent: Agent, body: Record<string, unknown>, path = '/api/messages/stream') {
  const res = await agent.post(path).send(body).buffer(true).parse(collect);
  return { res, events: res.headers['content-type']?.includes('text/event-stream') ? parseSSE(res.body as string) : [] };
}

describe('AI messaging (mocked provider)', () => {
  let provider: MockProvider;
  beforeEach(() => {
    provider = installMockProvider();
  });

  it('streams a reply, persists both messages, tracks usage and titles the chat', async () => {
    const { agent } = await signup();
    const { events } = await stream(agent, { content: 'Say hello' });
    const names = events.map((e) => e.event);
    expect(names[0]).toBe('meta');
    expect(names.filter((n) => n === 'delta')).toHaveLength(4);
    expect(names).toContain('title');
    expect(names.at(-1)).toBe('done');
    const text = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(text).toBe('Hello, world!');

    const conversationId = events[0]!.data.conversation.id;
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.content).toBe('Hello, world!');
    expect(messages[1]!.status).toBe('complete');
    expect(messages[1]!.tokenUsage?.totalTokens).toBe(14);
    expect((await Conversation.findById(conversationId))!.title).toBe('Greeting Exchange');
    expect(await UsageLog.countDocuments({ type: 'chat' })).toBe(1);
  });

  it('sends conversation context and the system prompt to the provider', async () => {
    const { agent } = await signup();
    const first = await stream(agent, { content: 'My name is Ada.' });
    const conversationId = first.events[0]!.data.conversation.id;
    provider.calls = [];
    await stream(agent, { conversationId, content: 'What is my name?' });
    const call = provider.calls[0]!;
    expect(call.messages[0]!.role).toBe('system');
    expect(call.messages.map((m) => m.content)).toEqual(expect.arrayContaining(['My name is Ada.', 'Hello, world!', 'What is my name?']));
    expect(call.messages.at(-1)!.content).toBe('What is my name?');
  });

  it('supports the non-streaming endpoint', async () => {
    const { agent } = await signup();
    const res = await agent.post('/api/messages').send({ content: 'hi' }).expect(201);
    expect(res.body.assistantMessage.content).toBe('Hello, world!');
  });

  it('keeps the user message and marks the reply as failed when the AI errors', async () => {
    const { agent } = await signup();
    provider.failWith = new AIProviderError('Provider down', 'AI_UNAVAILABLE', 502);
    const { events } = await stream(agent, { content: 'Will this fail?' });
    const err = events.find((e) => e.event === 'error')!;
    expect(err.data.code).toBe('AI_UNAVAILABLE');
    const conversationId = events[0]!.data.conversation.id;
    const msgs = await Message.find({ conversationId }).sort({ createdAt: 1 });
    expect(msgs[0]!.content).toBe('Will this fail?');
    expect(msgs[1]!.status).toBe('error');

    // Retry succeeds and replaces the failed reply.
    provider.failWith = null;
    const retry = await stream(agent, {}, `/api/messages/${msgs[1]!._id}/regenerate`);
    expect(retry.events.at(-1)!.event).toBe('done');
    const after = await Message.find({ conversationId }).sort({ createdAt: 1 });
    expect(after).toHaveLength(2);
    expect(after[1]!.status).toBe('complete');
  });

  it('rejects unavailable models gracefully', async () => {
    const { agent } = await signup();
    const res = await agent.post('/api/messages/stream').send({ content: 'hi', model: 'imaginary-model' }).expect(400);
    expect(res.body.error.code).toBe('MODEL_UNAVAILABLE');
  });

  it('moves old chats to the default model when their model was removed', async () => {
    const { agent } = await signup();
    const first = await agent.post('/api/messages').send({ content: 'hi', model: 'gpt-4o-mini' }).expect(201);
    const id = first.body.conversation.id;
    // Admin switches providers: only a local model remains.
    await updateSettings({ models: [{ id: 'llama3.2', label: 'Llama', provider: 'openai', description: '', enabled: true, vision: false, maxOutputTokens: 2048 }], defaultModel: 'llama3.2' });
    const res = await agent.post('/api/messages').send({ conversationId: id, content: 'again', model: 'gpt-4o-mini' }).expect(201);
    expect(res.body.assistantMessage.model).toBe('llama3.2');
    // Actively picking a model that doesn't exist is still an error.
    await agent.post('/api/messages').send({ conversationId: id, content: 'x', model: 'made-up' }).expect(400);
  });

  it('saves partial output when the client stops generating', async () => {
    const { agent } = await signup();
    provider.chunks = Array.from({ length: 40 }, (_, i) => `w${i} `);
    provider.delayMs = 25;
    const server = http.createServer(app).listen(0);
    const port = (server.address() as AddressInfo).port;
    const cookie = (await agent.get('/api/auth/me')).request.getHeader('cookie') as string | undefined;
    const jar = (agent as unknown as { jar: { getCookies: (o: unknown) => { name: string; value: string }[] } }).jar;
    const cookies = jar.getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false }).map((c) => `${c.name}=${c.value}`).join('; ');

    const controller = new AbortController();
    const resp = await fetch(`http://127.0.0.1:${port}/api/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookies || cookie || '' },
      body: JSON.stringify({ content: 'Write a long essay' }),
      signal: controller.signal,
    });
    const reader = resp.body!.getReader();
    let received = '';
    while (!received.includes('w3 ')) received += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    await new Promise((r) => setTimeout(r, 300));
    server.close();

    const assistant = await Message.findOne({ role: 'assistant' });
    expect(assistant!.status).toBe('stopped');
    expect(assistant!.content.length).toBeGreaterThan(0);
    expect(assistant!.content.split(' ').length).toBeLessThan(40);
  });

  it('edits a user message, discards later messages, and regenerates', async () => {
    const { agent } = await signup();
    const { events } = await stream(agent, { content: 'Original question' });
    const userMsgId = events[0]!.data.userMessage.id;
    const edit = await agent.patch(`/api/messages/${userMsgId}`).send({ content: 'Edited question' }).expect(200);
    expect(edit.body.message.content).toBe('Edited question');
    expect(edit.body.removedIds).toHaveLength(1);
    const regen = await stream(agent, {}, `/api/messages/${userMsgId}/regenerate`);
    expect(regen.events.at(-1)!.event).toBe('done');
    expect(provider.calls.at(-1)!.messages.at(-1)!.content).toBe('Edited question');
  });

  it('deletes a user message together with its reply', async () => {
    const { agent } = await signup();
    const { events } = await stream(agent, { content: 'Delete me' });
    const res = await agent.delete(`/api/messages/${events[0]!.data.userMessage.id}`).expect(200);
    expect(res.body.removedIds).toHaveLength(2);
    expect(await Message.countDocuments()).toBe(0);
  });

  it('stores like/dislike feedback', async () => {
    const { agent } = await signup();
    const { events } = await stream(agent, { content: 'Rate me' });
    const assistantId = events.at(-1)!.data.message.id;
    await agent.post(`/api/messages/${assistantId}/feedback`).send({ rating: 'dislike', comment: 'Too short' }).expect(200);
    expect(await Feedback.countDocuments({ rating: 'dislike' })).toBe(1);
    await agent.post(`/api/messages/${assistantId}/feedback`).send({ rating: 'like' }).expect(200);
    expect(await Feedback.countDocuments()).toBe(1);
    await agent.post(`/api/messages/${assistantId}/feedback`).send({ rating: null }).expect(200);
    expect(await Feedback.countDocuments()).toBe(0);
  });

  it('enforces daily message limits', async () => {
    const { agent } = await signup();
    await updateSettings({ limits: { dailyMessagesPerUser: 1, dailyTokensPerUser: 0, aiRequestsPerMinute: 100 } });
    await stream(agent, { content: 'one' });
    const res = await agent.post('/api/messages/stream').send({ content: 'two' }).expect(429);
    expect(res.body.error.code).toBe('USAGE_LIMIT');
  });
});
