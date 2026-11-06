import { describe, expect, it, beforeEach } from 'vitest';
import { installMockProvider, signup, signupAdmin } from './helpers';
import { User } from '../src/models/User';

describe('admin dashboard API', () => {
  beforeEach(() => {
    installMockProvider();
  });

  it('returns dashboard statistics', async () => {
    const { agent } = await signupAdmin();
    const other = await signup();
    await other.agent.post('/api/messages').send({ content: 'hello' }).expect(201);
    const res = await agent.get('/api/admin/dashboard').expect(200);
    expect(res.body.stats.totalUsers).toBe(2);
    expect(res.body.stats.totalConversations).toBe(1);
    expect(res.body.stats.totalMessages).toBe(2);
    expect(res.body.stats.totalTokens).toBeGreaterThan(0);
    expect(res.body.daily).toHaveLength(14);
  });

  it('lists, searches, blocks and deletes users', async () => {
    const { agent, user: admin } = await signupAdmin();
    const target = await signup({ name: 'Findable Person' });
    const search = await agent.get('/api/admin/users?search=findable').expect(200);
    expect(search.body.users).toHaveLength(1);

    await agent.patch(`/api/admin/users/${target.user.id}`).send({ blocked: true }).expect(200);
    await target.agent.get('/api/auth/me').expect(403);
    await agent.patch(`/api/admin/users/${target.user.id}`).send({ blocked: false }).expect(200);
    await target.agent.get('/api/auth/me').expect(200);

    await agent.patch(`/api/admin/users/${admin.id}`).send({ blocked: true }).expect(400);
    await agent.delete(`/api/admin/users/${target.user.id}`).expect(200);
    expect(await User.findById(target.user.id)).toBeNull();
  });

  it('manages model availability', async () => {
    const { agent } = await signupAdmin();
    const user = await signup();
    const { body } = await agent.get('/api/admin/settings').expect(200);
    const models = body.settings.models.map((m: { id: string }) => ({ ...m, enabled: m.id === body.settings.defaultModel }));
    models.push({ id: 'custom-model', label: 'Custom', provider: 'openai', enabled: false, vision: false, maxOutputTokens: 1000, description: '' });
    await agent.patch('/api/admin/settings').send({ models }).expect(200);

    const list = await user.agent.get('/api/models').expect(200);
    const custom = list.body.models.find((m: { id: string }) => m.id === 'custom-model');
    expect(custom.available).toBe(false);
    await user.agent.post('/api/messages/stream').send({ content: 'hi', model: 'custom-model' }).expect(400);

    // Default model must stay enabled.
    await agent.patch('/api/admin/settings').send({ defaultModel: 'custom-model' }).expect(400);
  });

  it('hides conversation content unless the privacy toggle is enabled', async () => {
    const { agent } = await signupAdmin();
    const user = await signup();
    const sent = await user.agent.post('/api/messages').send({ content: 'private stuff' }).expect(201);
    const id = sent.body.conversation.id;
    const list = await agent.get('/api/admin/conversations').expect(200);
    expect(list.body.conversations).toHaveLength(1);
    await agent.get(`/api/admin/conversations/${id}`).expect(403);
    await agent.patch('/api/admin/settings').send({ allowAdminConversationAccess: true }).expect(200);
    const detail = await agent.get(`/api/admin/conversations/${id}`).expect(200);
    expect(detail.body.messages[0].content).toBe('private stuff');
  });

  it('reports usage and feedback', async () => {
    const { agent } = await signupAdmin();
    const user = await signup();
    const sent = await user.agent.post('/api/messages').send({ content: 'hello' }).expect(201);
    await user.agent.post(`/api/messages/${sent.body.assistantMessage.id}/feedback`).send({ rating: 'like' }).expect(200);
    const usage = await agent.get('/api/admin/usage?days=7').expect(200);
    expect(usage.body.byModel[0].requests).toBeGreaterThan(0);
    const fb = await agent.get('/api/admin/feedback').expect(200);
    expect(fb.body.feedback[0].rating).toBe('like');
  });
});
