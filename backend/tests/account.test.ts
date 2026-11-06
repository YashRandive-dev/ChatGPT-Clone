import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import { app, installMockProvider, MockProvider, signup } from './helpers';
import { outbox } from '../src/services/emailService';
import { User } from '../src/models/User';
import { uploadRoot } from '../src/services/fileService';

const codeFrom = (text: string) => /code is: (\d{6})/.exec(text)![1]!;
const lastMail = (subject: string) => [...outbox].reverse().find((m) => m.subject.includes(subject));
// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

describe('profile & settings upgrades', () => {
  let provider: MockProvider;
  beforeEach(() => {
    provider = installMockProvider();
  });
  afterAll(async () => {
    await fs.rm(uploadRoot(), { recursive: true, force: true });
  });

  it('sends personalization to the AI in the system prompt', async () => {
    const { agent } = await signup();
    await agent.patch('/api/settings').send({ nickname: 'Ada', occupation: 'Robotics engineer', aboutYou: 'I like concise answers' }).expect(200);
    await agent.post('/api/messages').send({ content: 'hello' }).expect(201);
    const system = String(provider.calls[0]!.messages[0]!.content);
    expect(system).toContain('Preferred name: Ada');
    expect(system).toContain('Occupation: Robotics engineer');
    expect(system).toContain('I like concise answers');
    await agent.patch('/api/settings').send({ nickname: 'x'.repeat(51) }).expect(400);
  });

  it('uploads, serves and removes an avatar', async () => {
    const { agent, user } = await signup();
    const up = await agent.post('/api/users/me/avatar').attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' }).expect(200);
    expect(up.body.user.hasUploadedAvatar).toBe(true);
    expect(up.body.user.avatar).toMatch(new RegExp(`^/api/users/${user.id}/avatar`));
    const img = await request(app).get(`/api/users/${user.id}/avatar`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    // Content that isn't really an image is rejected.
    await agent.post('/api/users/me/avatar').attach('avatar', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    const del = await agent.delete('/api/users/me/avatar').expect(200);
    expect(del.body.user.avatar).toBeNull();
    await request(app).get(`/api/users/${user.id}/avatar`).expect(404);
  });

  it('requires an emailed code at sign-in when two-step verification is on', async () => {
    const { agent, creds, user } = await signup();
    await agent.post('/api/users/me/two-factor').send({ enabled: true, password: creds.password }).expect(400); // email not verified
    await User.updateOne({ _id: user.id }, { emailVerified: true });
    await agent.post('/api/users/me/two-factor').send({ enabled: true, password: 'wrong' }).expect(400);
    const on = await agent.post('/api/users/me/two-factor').send({ enabled: true, password: creds.password }).expect(200);
    expect(on.body.user.twoFactorEnabled).toBe(true);

    const login = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
    expect(login.body.twoFactorRequired).toBe(true);
    expect(login.body.user).toBeUndefined();
    expect(login.headers['set-cookie']).toBeUndefined();
    const code = codeFrom(lastMail('sign-in code')!.text);

    const wrong = code === '000000' ? '111111' : '000000';
    await request(app).post('/api/auth/login/verify').send({ challengeToken: login.body.challengeToken, code: wrong }).expect(400);
    await request(app).post('/api/auth/login/resend').send({ challengeToken: login.body.challengeToken }).expect(429);

    const fresh = request.agent(app);
    const done = await fresh.post('/api/auth/login/verify').send({ challengeToken: login.body.challengeToken, code }).expect(200);
    expect(done.body.user.email).toBe(creds.email);
    await fresh.get('/api/auth/me').expect(200);
    // Single use.
    await request(app).post('/api/auth/login/verify').send({ challengeToken: login.body.challengeToken, code }).expect(400);
  });

  it('emails security alerts for new devices and password changes', async () => {
    const { creds, agent } = await signup();
    outbox.length = 0;
    // Same browser as registration: no alert.
    await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
    expect(lastMail('New sign-in')).toBeUndefined();
    await request(app).post('/api/auth/login').set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120').send({ email: creds.email, password: creds.password }).expect(200);
    expect(lastMail('New sign-in')!.text).toContain('Chrome on Windows');

    await agent.patch('/api/users/me/password').send({ currentPassword: creds.password, newPassword: 'NewPassw0rd' }).expect(200);
    expect(lastMail('password was changed')).toBeDefined();

    // Alerts can be turned off.
    await agent.patch('/api/settings').send({ notifyNewSignIn: false }).expect(200);
    outbox.length = 0;
    await request(app).post('/api/auth/login').set('User-Agent', 'Firefox/130 Linux').send({ email: creds.email, password: 'NewPassw0rd' }).expect(200);
    expect(lastMail('New sign-in')).toBeUndefined();
  });

  it('archives chats and manages shared links', async () => {
    const { agent } = await signup();
    const a = (await agent.post('/api/messages').send({ content: 'first' }).expect(201)).body.conversation.id;
    const b = (await agent.post('/api/messages').send({ content: 'second' }).expect(201)).body.conversation.id;
    await agent.patch(`/api/conversations/${a}`).send({ archived: true }).expect(200);
    const visible = await agent.get('/api/conversations').expect(200);
    expect(visible.body.conversations.map((c: { id: string }) => c.id)).toEqual([b]);
    const archived = await agent.get('/api/conversations?archived=true').expect(200);
    expect(archived.body.conversations.map((c: { id: string }) => c.id)).toEqual([a]);
    await agent.post('/api/conversations/archive-all').expect(200);
    expect((await agent.get('/api/conversations').expect(200)).body.conversations).toHaveLength(0);

    await agent.post(`/api/conversations/${b}/share`).expect(200);
    const shared = await agent.get('/api/conversations/shared').expect(200);
    expect(shared.body.conversations).toHaveLength(1);
    await agent.delete('/api/conversations/shared').expect(200);
    expect((await agent.get('/api/conversations/shared').expect(200)).body.conversations).toHaveLength(0);
  });

  it('returns personal usage stats', async () => {
    const { agent } = await signup();
    await agent.post('/api/messages').send({ content: 'hello' }).expect(201);
    const stats = await agent.get('/api/users/me/stats').expect(200);
    expect(stats.body).toMatchObject({ conversations: 1, messages: 2, sentMessages: 1, activeDays30: 1 });
    expect(stats.body.tokens.total).toBeGreaterThan(0);
    expect(stats.body.activity).toHaveLength(30);
  });
});
