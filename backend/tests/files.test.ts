import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { installMockProvider, MockProvider, signup } from './helpers';
import { FileModel } from '../src/models/File';
import { uploadRoot } from '../src/services/fileService';

describe('file uploads', () => {
  let provider: MockProvider;
  beforeEach(() => {
    provider = installMockProvider();
  });
  afterAll(async () => {
    await fs.rm(uploadRoot(), { recursive: true, force: true });
  });

  it('uploads a text file and includes its content as AI context', async () => {
    const { agent } = await signup();
    const up = await agent.post('/api/files/upload').attach('file', Buffer.from('The secret code is 4242.'), { filename: 'notes.txt', contentType: 'text/plain' }).expect(201);
    expect(up.body.file.kind).toBe('txt');
    expect(up.body.file.hasText).toBe(true);

    await agent.post('/api/messages').send({ content: 'What is the code?', attachments: [up.body.file.id] }).expect(201);
    const lastUser = provider.calls[0]!.messages.at(-1)!;
    expect(String(lastUser.content)).toContain('4242');
    expect(String(lastUser.content)).toContain('notes.txt');

    const dl = await agent.get(`/api/files/${up.body.file.id}`).expect(200);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects disguised and unsupported files', async () => {
    const { agent } = await signup();
    await agent.post('/api/files/upload').attach('file', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), { filename: 'evil.png', contentType: 'image/png' }).expect(400);
    await agent.post('/api/files/upload').attach('file', Buffer.from('#!/bin/sh'), { filename: 'run.sh', contentType: 'application/x-sh' }).expect(400);
  });

  it('enforces file ownership', async () => {
    const alice = await signup();
    const bob = await signup();
    const up = await alice.agent.post('/api/files/upload').attach('file', Buffer.from('alice data'), { filename: 'a.txt', contentType: 'text/plain' }).expect(201);
    await bob.agent.get(`/api/files/${up.body.file.id}`).expect(404);
    await bob.agent.delete(`/api/files/${up.body.file.id}`).expect(404);
    await bob.agent.post('/api/messages').send({ content: 'steal', attachments: [up.body.file.id] }).expect(400);
    const stored = await FileModel.findById(up.body.file.id).lean();
    await alice.agent.delete(`/api/files/${up.body.file.id}`).expect(200);
    expect(await FileModel.countDocuments()).toBe(0);
    await expect(fs.access(path.join(uploadRoot(), stored!.storageName))).rejects.toThrow();
  });
});
