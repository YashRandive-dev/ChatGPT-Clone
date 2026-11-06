import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { User } from '../src/models/User';
import { Conversation } from '../src/models/Conversation';
import { Message } from '../src/models/Message';
import { Feedback } from '../src/models/Feedback';
import { getSettings, parseModelsFromEnv, resolveModel, syncModelsFromEnv, updateSettings } from '../src/services/settingsService';
import { env } from '../src/config/env';
import { titleFromMessage } from '../src/utils/strings';
import { detectKind } from '../src/services/fileService';

describe('models', () => {
  it('applies user defaults and enforces unique emails', async () => {
    const u = await User.create({ name: 'A', email: 'A@x.io', password: 'hash' });
    expect(u.email).toBe('a@x.io');
    expect(u.role).toBe('user');
    expect(u.preferences.theme).toBe('system');
    expect(u.preferences.sendOnEnter).toBe(true);
    await expect(User.create({ name: 'B', email: 'a@x.io', password: 'hash' })).rejects.toThrow();
  });

  it('hides password by default', async () => {
    await User.create({ name: 'A', email: 'p@x.io', password: 'secret-hash' });
    const found = await User.findOne({ email: 'p@x.io' });
    expect(found!.password).toBeUndefined();
  });

  it('stores messages linked to conversations', async () => {
    const userId = new Types.ObjectId();
    const c = await Conversation.create({ userId, title: 'T', model: 'm' });
    await Message.create({ conversationId: c._id, userId, role: 'user', content: 'hi' });
    const m = await Message.findOne({ conversationId: c._id });
    expect(m!.status).toBe('complete');
    expect(m!.feedback.rating).toBeNull();
  });

  it('allows one feedback per user per message', async () => {
    const ids = { userId: new Types.ObjectId(), messageId: new Types.ObjectId(), conversationId: new Types.ObjectId() };
    await Feedback.create({ ...ids, rating: 'like' });
    await expect(Feedback.create({ ...ids, rating: 'dislike' })).rejects.toThrow();
  });

  it('seeds app settings from env and resolves models', async () => {
    const settings = await getSettings(true);
    expect(settings.models.length).toBeGreaterThan(0);
    expect(resolveModel(settings)?.id).toBe(settings.defaultModel);
    expect(resolveModel(settings, 'does-not-exist')).toBeNull();
    expect(parseModelsFromEnv('a|A|true,b')).toEqual([
      expect.objectContaining({ id: 'a', label: 'A', vision: true }),
      expect.objectContaining({ id: 'b', label: 'b', vision: false }),
    ]);
  });
});

describe('utilities', () => {
  it('builds titles from the first message', () => {
    expect(titleFromMessage('  How do **black holes** form?  ')).toBe('How do black holes form?');
    expect(titleFromMessage('x'.repeat(100)).length).toBeLessThanOrEqual(61);
    expect(titleFromMessage('```js\ncode\n```')).toBe('New chat');
  });

  it('detects file types from magic bytes', () => {
    expect(detectKind(Buffer.from('%PDF-1.7 ...'), '.pdf')?.kind).toBe('pdf');
    expect(detectKind(Buffer.from('%PDF-1.7 ...'), '.png')).toBeNull();
    expect(detectKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), '.png')?.kind).toBe('image');
    expect(detectKind(Buffer.from('hello world'), '.txt')?.kind).toBe('txt');
    expect(detectKind(Buffer.from([0x4d, 0x5a, 0x00, 0x01]), '.txt')).toBeNull();
  });
});

describe('model catalog sync', () => {
  it('replaces the stored models when AI_MODELS changes, and keeps admin edits otherwise', async () => {
    await getSettings(true); // seeded from env
    expect((await syncModelsFromEnv()).changed).toBe(false);

    // Admin edits survive restarts while AI_MODELS is unchanged.
    await updateSettings({ models: [{ id: 'custom', label: 'Custom', provider: 'openai', description: '', enabled: true, vision: false, maxOutputTokens: 512 }], defaultModel: 'custom' });
    expect((await syncModelsFromEnv()).changed).toBe(false);
    expect((await getSettings(true)).defaultModel).toBe('custom');

    // Changing AI_MODELS (e.g. switching to Ollama) replaces the list on next start.
    const original = env.AI_MODELS;
    (env as { AI_MODELS: string }).AI_MODELS = 'llama3.2|Llama 3.2 (local)|false';
    try {
      const res = await syncModelsFromEnv();
      expect(res).toEqual({ changed: true, models: ['llama3.2'] });
      expect((await getSettings(true)).defaultModel).toBe('llama3.2');
    } finally {
      (env as { AI_MODELS: string }).AI_MODELS = original;
    }
  });
});
