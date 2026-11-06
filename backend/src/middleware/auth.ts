import type { NextFunction, Request, Response } from 'express';
import { User, type IUser } from '../models/User';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/tokenService';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export type AuthUser = Omit<IUser, 'password'>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.cookies?.[ACCESS_COOKIE];
  return typeof cookie === 'string' && cookie ? cookie : undefined;
}

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/** Requires a valid access token and an active (not blocked) account. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).lean<AuthUser>();
  if (!user) throw ApiError.unauthorized('Account no longer exists', 'INVALID_TOKEN');
  if (user.blocked) throw ApiError.forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');
  req.user = user;
  if (!user.lastActiveAt || Date.now() - new Date(user.lastActiveAt).getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
    void User.updateOne({ _id: user._id }, { lastActiveAt: new Date() }).catch(() => undefined);
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'admin') throw ApiError.forbidden('Administrator access required');
  next();
}

/** Blocks unverified users from AI features when REQUIRE_EMAIL_VERIFICATION is on. */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (env.REQUIRE_EMAIL_VERIFICATION && req.user && !req.user.emailVerified) {
    throw ApiError.forbidden('Please verify your email address first', 'EMAIL_NOT_VERIFIED');
  }
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
