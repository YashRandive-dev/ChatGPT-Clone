import type { Request } from 'express';
import { RefreshToken } from '../models/RefreshToken';
import type { IUser } from '../models/User';
import { sendNewSignInEmail, sendPasswordChangedEmail } from './emailService';
import { logger } from '../utils/logger';

export function describeUserAgent(ua: string | null | undefined) {
  if (!ua) return 'an unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** True when this browser has never held a session for the user. Call before issuing the new session. */
export async function isNewDevice(userId: IUser['_id'], req: Request) {
  const ua = req.get('user-agent')?.slice(0, 512) ?? null;
  return !(await RefreshToken.exists({ userId, userAgent: ua }));
}

/** Fire-and-forget alert so a mail outage never blocks sign-in. */
export function alertNewSignIn(user: Pick<IUser, 'email' | 'name' | 'preferences'>, req: Request) {
  if (user.preferences?.notifyNewSignIn === false) return;
  sendNewSignInEmail(user.email, user.name, describeUserAgent(req.get('user-agent')), req.ip ?? null, new Date()).catch((err) =>
    logger.error('Failed to send new sign-in alert', err),
  );
}

export function alertPasswordChanged(user: Pick<IUser, 'email' | 'name' | 'preferences'>) {
  if (user.preferences?.notifyPasswordChange === false) return;
  sendPasswordChangedEmail(user.email, user.name, new Date()).catch((err) => logger.error('Failed to send password change alert', err));
}
