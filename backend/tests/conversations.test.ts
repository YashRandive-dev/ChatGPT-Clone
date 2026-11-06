import { describe, expect, it, beforeEach } from 'vitest';
import { installMockProvider, parseSSE, signup } from './helpers';
import { Conversation } from '../src/models/Conversation';
import { Message } from '../src/models/Message';
import request from 'supertest';
import { app } from './helpers';

async function startChat(agent: ReturnType<typeof request.agent>, content = 'Hello there') {
  const res = await agent.post('/api/messages/stream').send({ content }).buffer(true).parse((r, cb) => {
    let data = '';
    r.on('data', (c: Buffer) => (data += c.toString()));
    r.on('end', () => cb(null, data));
  });
  const events = parseSSE(res.body as string);
  return events.find((e) => e.event === 'meta')!.data.conversation.id as string;
}

describe('conversations & authorization', () => {
  beforeEach(() => {
    installMockProvider();
  });

  it('creates, lists, renames and deletes conversations', async () => {
    const { agent } = await signup();
    const created = await agent.post('/api/conversations').send({ title: 'My chat' }).expect(201);
    const id = created.body.conversation.id;
    const list = await agent.get('/api/conversations').expect(200);
    expect(list.body.conversations.map((c: { id: string }) => c.id)).toContain(id);
    const renamed = await agent.patch(`/api/conversations/${id}`).send({ title: 'Renamed' }).expect(200);
    expect(renamed.body.conversation.title).toBe('Renamed');
    await agent.delete(`/api/conversations/${id}`).expect(200);
    await agent.get(`/api/conversations/${id}`).expect(404);
  });

  it('paginates the conversation list with a cursor', async () => {
    const { agent, user } = await signup();
    for (let i = 0; i < 5; i++) {
      await Conversation.create({ userId: user.id, title: `C${i}`, model: 'gpt-4o-mini', updatedAt: new Date(Date.now() - i * 1000) });
    }
    const p1 = await agent.get('/api/conversations?limit=2').expect(200);
    expect(p1.body.conversations).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await agent.get(`/api/conversations?limit=2&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.conversations[0].id).not.toBe(p1.body.conversations[1].id);
  });

  it('searches titles and message content', async () => {
    const { agent } = await signup();
    await startChat(agent, 'Tell me about quasars');
    await startChat(agent, 'Recipe for pancakes');
    const res = await agent.get('/api/conversations?search=quasars').expect(200);
    expect(res.body.conversations).toHaveLength(1);
  });

  it('prevents users from accessing other users conversations', async () => {
    const alice = await signup();
    const bob = await signup();
    const id = await startChat(alice.agent);
    await bob.agent.get(`/api/conversations/${id}`).expect(404);
    await bob.agent.patch(`/api/conversations/${id}`).send({ title: 'pwned' }).expect(404);
    await bob.agent.delete(`/api/conversations/${id}`).expect(404);
    await bob.agent.post('/api/messages/stream').send({ conversationId: id, content: 'hi' }).expect(404);
    const msg = await Message.findOne({ conversationId: id, role: 'assistant' });
    await bob.agent.post(`/api/messages/${msg!._id}/regenerate`).send({}).expect(404);
    await bob.agent.patch(`/api/messages/${msg!._id}`).send({ content: 'x' }).expect(404);
    await bob.agent.post(`/api/messages/${msg!._id}/feedback`).send({ rating: 'like' }).expect(404);
    const bobList = await bob.agent.get('/api/conversations').expect(200);
    expect(bobList.body.conversations).toHaveLength(0);
    expect((await Conversation.findById(id))!.title).not.toBe('pwned');
  });

  it('rejects invalid ids', async () => {
    const { agent } = await signup();
    await agent.get('/api/conversations/not-an-id').expect(400);
  });

  it('shares a conversation publicly as read-only', async () => {
    const { agent } = await signup();
    const id = await startChat(agent, 'Shared question');
    const share = await agent.post(`/api/conversations/${id}/share`).expect(200);
    const pub = await request(app).get(`/api/share/${share.body.shareId}`).expect(200);
    expect(pub.body.messages[0].content).toBe('Shared question');
    await agent.delete(`/api/conversations/${id}/share`).expect(200);
    await request(app).get(`/api/share/${share.body.shareId}`).expect(404);
  });

  it('restricts the admin API to admins', async () => {
    const { agent } = await signup();
    await agent.get('/api/admin/dashboard').expect(403);
    await agent.get('/api/admin/users').expect(403);
  });
});
