import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, installMockProvider, signup } from './helpers';
import { User } from '../src/models/User';
import { Conversation } from '../src/models/Conversation';

describe('user settings', () => {
  it('reads and updates preferences', async () => {
    const { agent } = await signup();
    const res = await agent.get('/api/settings').expect(200);
    expect(res.body.preferences.theme).toBe('system');
    expect(res.body.models.length).toBeGreaterThan(0);
    const upd = await agent.patch('/api/settings').send({ theme: 'dark', language: 'es', sendOnEnter: false }).expect(200);
    expect(upd.body.preferences).toMatchObject({ theme: 'dark', language: 'es', sendOnEnter: false });
    const more = await agent
      .patch('/api/settings')
      .send({ fontSize: 'large', chatWidth: 'wide', codeWrap: true, showTokenUsage: true, autoScroll: false, reduceMotion: true, suggestedPrompts: false })
      .expect(200);
    expect(more.body.preferences).toMatchObject({ fontSize: 'large', chatWidth: 'wide', codeWrap: true, autoScroll: false });
    await agent.patch('/api/settings').send({ fontSize: 'huge' }).expect(400);
    await agent.patch('/api/settings').send({ defaultModel: 'nope' }).expect(400);
    await agent.patch('/api/settings').send({ theme: 'neon' }).expect(400);
  });

  it('changes the password (requires the current one)', async () => {
    const { agent, creds } = await signup();
    await agent.patch('/api/users/me/password').send({ currentPassword: 'wrong', newPassword: 'NewPassw0rd' }).expect(400);
    await agent.patch('/api/users/me/password').send({ currentPassword: creds.password, newPassword: 'NewPassw0rd' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: creds.email, password: 'NewPassw0rd' }).expect(200);
  });

  it('changes name and email', async () => {
    const { agent, creds } = await signup();
    await agent.patch('/api/users/me').send({ email: 'new@test.dev' }).expect(400);
    const res = await agent.patch('/api/users/me').send({ name: 'Renamed', email: 'new@test.dev', currentPassword: creds.password }).expect(200);
    expect(res.body.user).toMatchObject({ name: 'Renamed', email: 'new@test.dev', emailVerified: false });
  });

  it('locks the email address once it is verified', async () => {
    const { agent, user, creds } = await signup();
    await User.updateOne({ _id: user.id }, { emailVerified: true });
    const res = await agent.patch('/api/users/me').send({ email: 'other@test.dev', currentPassword: creds.password }).expect(403);
    expect(res.body.error.code).toBe('EMAIL_LOCKED');
    // Other fields still update, and re-sending the same email is a no-op.
    const ok = await agent.patch('/api/users/me').send({ name: 'Still editable', email: creds.email }).expect(200);
    expect(ok.body.user).toMatchObject({ name: 'Still editable', email: creds.email, emailVerified: true });
  });

  it('exports and deletes the account', async () => {
    installMockProvider();
    const { agent, user, creds } = await signup();
    await agent.post('/api/messages').send({ content: 'remember this' }).expect(201);
    const exp = await agent.get('/api/users/me/export').expect(200);
    const data = JSON.parse(exp.text);
    expect(data.conversations[0].messages[0].content).toBe('remember this');
    await agent.delete('/api/users/me').send({ password: 'wrong' }).expect(400);
    await agent.delete('/api/users/me').send({ password: creds.password }).expect(200);
    expect(await User.findById(user.id)).toBeNull();
    expect(await Conversation.countDocuments({ userId: user.id })).toBe(0);
  });
});
