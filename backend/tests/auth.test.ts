import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, signup } from './helpers';
import { outbox } from '../src/services/emailService';
import { User } from '../src/models/User';
import { RefreshToken } from '../src/models/RefreshToken';

const codeFrom = (text: string) => /code is: (\d{6})/.exec(text)![1]!;
const lastMail = (subject: string) => [...outbox].reverse().find((m) => m.subject.includes(subject))!;

describe('authentication', () => {
  it('registers, sets httpOnly cookies, and never returns the password', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Ada', email: 'Ada@Example.com', password: 'Passw0rd!' }).expect(201);
    expect(res.body.user.email).toBe('ada@example.com');
    expect(res.body.user.password).toBeUndefined();
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('kairo_at=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('kairo_rt=') && c.includes('Path=/api/auth'))).toBe(true);
    const stored = await User.findOne({ email: 'ada@example.com' }).select('+password');
    expect(stored!.password).not.toBe('Passw0rd!');
    expect(stored!.password.startsWith('$2')).toBe(true);
    expect(outbox.some((m) => m.subject.includes('verification code'))).toBe(true);
    expect(res.body.verification.resendInSeconds).toBe(60);
  });

  it('validates input', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate emails', async () => {
    const { creds } = await signup();
    await request(app).post('/api/auth/register').send(creds).expect(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const { creds } = await signup();
    await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrongpass1' }).expect(401);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe(creds.email);
  });

  it('blocks NoSQL operator injection in login', async () => {
    await signup();
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('protects routes without a token', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/conversations').expect(401);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'R', email: 'rot@test.dev', password: 'Passw0rd!' }).expect(201);
    const original = ([] as string[]).concat(reg.headers['set-cookie'] ?? []).find((c) => c.startsWith('kairo_rt='))!.split(';')[0]!;
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', original).expect(200);
    const next = ([] as string[]).concat(rotated.headers['set-cookie'] ?? []).find((c) => c.startsWith('kairo_rt='))!.split(';')[0]!;
    expect(next).not.toBe(original);
    // A replay a moment later is treated as a harmless race (two tabs refreshing at once).
    await request(app).post('/api/auth/refresh').set('Cookie', original).expect(200);
    // Once the grace window has passed, replaying the old token revokes the whole family...
    await RefreshToken.updateMany({ revokedAt: { $ne: null } }, { revokedAt: new Date(Date.now() - 60_000) });
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', original).expect(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');
    // ...including the newest token.
    await request(app).post('/api/auth/refresh').set('Cookie', next).expect(401);
  });

  it('reports the session without 401s and renews expired access tokens', async () => {
    const anon = await request(app).get('/api/auth/session').expect(200);
    expect(anon.body.user).toBeNull();
    const reg = await request(app).post('/api/auth/register').send({ name: 'S', email: 'sess@test.dev', password: 'Passw0rd!' }).expect(201);
    const refreshOnly = ([] as string[]).concat(reg.headers['set-cookie'] ?? []).find((c) => c.startsWith('kairo_rt='))!.split(';')[0]!;
    const res = await request(app).get('/api/auth/session').set('Cookie', refreshOnly).expect(200);
    expect(res.body.user.email).toBe('sess@test.dev');
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).some((c) => c.startsWith('kairo_at='))).toBe(true);
    const bad = await request(app).get('/api/auth/session').set('Cookie', 'kairo_at=garbage').expect(200);
    expect(bad.body.user).toBeNull();
  });

  it('logs out and revokes the refresh token', async () => {
    const { agent } = await signup();
    await agent.post('/api/auth/logout').expect(200);
    await agent.post('/api/auth/refresh').expect(401);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('resets the password with an emailed OTP', async () => {
    const { creds, agent } = await signup();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: creds.email }).expect(200);
    // Unknown emails get the same response.
    const ghost = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@test.dev' }).expect(200);
    expect(ghost.body.message).toBe(res.body.message);
    const code = codeFrom(lastMail('reset code').text);
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await request(app).post('/api/auth/verify-reset-code').send({ email: creds.email, code: wrong }).expect(400);
    expect(bad.body.error.details.attemptsLeft).toBe(4);

    const ok = await request(app).post('/api/auth/verify-reset-code').send({ email: creds.email, code }).expect(200);
    // The code is single-use once exchanged.
    await request(app).post('/api/auth/verify-reset-code').send({ email: creds.email, code }).expect(429);

    await request(app).post('/api/auth/reset-password').send({ token: ok.body.resetToken, password: 'short' }).expect(400);
    await request(app).post('/api/auth/reset-password').send({ token: ok.body.resetToken, password: 'NewPassw0rd' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token: ok.body.resetToken, password: 'OtherPass1' }).expect(400);
    // Old sessions are revoked.
    await agent.post('/api/auth/refresh').expect(401);
    await request(app).post('/api/auth/login').send({ email: creds.email, password: 'NewPassw0rd' }).expect(200);
  });

  it('locks a reset code after too many wrong attempts and throttles resends', async () => {
    const { creds } = await signup();
    await request(app).post('/api/auth/forgot-password').send({ email: creds.email }).expect(200);
    const code = codeFrom(lastMail('reset code').text);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await request(app).post('/api/auth/verify-reset-code').send({ email: creds.email, code: wrong }).expect(400);
    await request(app).post('/api/auth/verify-reset-code').send({ email: creds.email, code: wrong }).expect(429);
    // Even the right code no longer works.
    await request(app).post('/api/auth/verify-reset-code').send({ email: creds.email, code }).expect(429);
    // A second request inside the cooldown sends nothing new.
    const before = outbox.length;
    await request(app).post('/api/auth/forgot-password').send({ email: creds.email }).expect(200);
    expect(outbox.length).toBe(before);
  });

  it('verifies email addresses with an OTP', async () => {
    const { user, agent } = await signup();
    const code = codeFrom(lastMail('verification code').text);
    await request(app).post('/api/auth/verify-email').send({ code }).expect(401);
    await agent.post('/api/auth/verify-email').send({ code: '12ab' }).expect(400);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await agent.post('/api/auth/verify-email').send({ code: wrong }).expect(400);
    expect(bad.body.error.code).toBe('INVALID_CODE');
    const ok = await agent.post('/api/auth/verify-email').send({ code }).expect(200);
    expect(ok.body.user.emailVerified).toBe(true);
    expect((await User.findById(user.id))!.emailVerified).toBe(true);
  });

  it('enforces a cooldown on verification resends', async () => {
    const { agent } = await signup();
    const res = await agent.post('/api/auth/resend-verification').expect(429);
    expect(res.body.error.code).toBe('RESEND_COOLDOWN');
    expect(res.body.error.details.retryAfter).toBeGreaterThan(0);
  });

  it('exposes public auth config', async () => {
    const res = await request(app).get('/api/auth/config').expect(200);
    expect(res.body.otp).toMatchObject({ length: 6, maxAttempts: 5 });
  });

  it('denies blocked users', async () => {
    const { agent, user, creds } = await signup();
    await User.updateOne({ _id: user.id }, { blocked: true });
    const res = await agent.get('/api/auth/me').expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
    await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password }).expect(403);
  });

  it('rejects state-changing requests from foreign origins', async () => {
    const res = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });
});
