import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Request, Response, CookieOptions } from 'express';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { RefreshToken } from '../models/RefreshToken';
import { hashToken, randomToken } from '../utils/crypto';
import { ApiError } from '../utils/ApiError';
import type { Role } from '../models/User';

export const ACCESS_COOKIE = 'kairo_at';
export const REFRESH_COOKIE = 'kairo_rt';

export interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role } satisfies AccessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'kairo-api',
    audience: 'kairo-web',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'kairo-api', audience: 'kairo-web' });
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    return { sub: String(payload.sub), role: (payload as AccessPayload).role };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

function baseCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd,
    // Cross-site deployments (e.g. Vercel + Render) need SameSite=None; Secure.
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

/** Window in which re-use of a just-rotated refresh token is treated as a benign race. */
const CONCURRENT_GRACE_MS = 10_000;

const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Refresh tokens are opaque random strings combined with a JWT envelope. Only a SHA-256
 * hash is stored. Each use rotates the token; re-use of a rotated token revokes the family.
 */
export async function issueRefreshToken(
  userId: Types.ObjectId | string,
  req: Request,
  family = randomToken(16),
): Promise<string> {
  const secret = randomToken(48);
  const token = jwt.sign({ sub: String(userId), fam: family, jti: secret }, env.JWT_REFRESH_SECRET, {
    expiresIn: Math.floor(refreshTtlMs() / 1000),
    issuer: 'kairo-api',
  });
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    family,
    expiresAt: new Date(Date.now() + refreshTtlMs()),
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    ip: req.ip ?? null,
  });
  return token;
}

export async function rotateRefreshToken(token: string, req: Request) {
  let payload: jwt.JwtPayload;
  try {
    const p = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'kairo-api' });
    if (typeof p === 'string') throw new Error('bad');
    payload = p;
  } catch {
    throw ApiError.unauthorized('Invalid refresh token', 'INVALID_REFRESH');
  }
  const record = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (!record || record.expiresAt < new Date()) throw ApiError.unauthorized('Session expired', 'INVALID_REFRESH');
  if (record.revokedAt && record.replacedBy && Date.now() - record.revokedAt.getTime() < CONCURRENT_GRACE_MS) {
    // Two requests (e.g. two tabs, or React dev double-effects) refreshed with the same token at
    // the same moment. The first one already rotated it; this is not an attack, so don't revoke.
    return { userId: String(payload.sub ?? record.userId), refreshToken: null, sessionId: record.family };
  }
  if (record.revokedAt) {
    // Token reuse detected: someone replayed an already-rotated token. Kill the whole family.
    await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { revokedAt: new Date() });
    throw ApiError.unauthorized('Session revoked', 'REFRESH_REUSED');
  }
  const next = await issueRefreshToken(record.userId, req, record.family);
  record.revokedAt = new Date();
  record.replacedBy = hashToken(next);
  record.lastUsedAt = new Date();
  await record.save();
  return { userId: String(payload.sub ?? record.userId), refreshToken: next, sessionId: record.family };
}

export async function revokeRefreshToken(token: string | undefined) {
  if (!token) return;
  const record = await RefreshToken.findOne({ tokenHash: hashToken(token) });
  if (record) await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { revokedAt: new Date() });
}

export async function revokeAllUserSessions(userId: Types.ObjectId | string) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string | null) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie(), path: '/', maxAge: 60 * 60 * 1000 });
  // null = a concurrent request already rotated the refresh token and set the new cookie.
  if (!refreshToken) return;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    path: '/api/auth',
    maxAge: refreshTtlMs(),
    signed: true,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: '/api/auth', signed: true });
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = req.signedCookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : undefined;
}

export function hashForSession(token: string) {
  return hashToken(token);
}
