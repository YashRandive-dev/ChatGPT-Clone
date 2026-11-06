import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, serializeUser, type IUser, type UserDoc } from '../models/User';
import { alertNewSignIn, alertPasswordChanged, isNewDevice } from '../services/securityNotifier';
import { RefreshToken } from '../models/RefreshToken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import {
  clearAuthCookies,
  hashForSession,
  issueRefreshToken,
  readRefreshCookie,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
  verifyAccessToken,
  ACCESS_COOKIE,
} from '../services/tokenService';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  consumeResetToken,
  issueEmailVerificationOtp,
  requestPasswordResetOtp,
  verifyEmailOtp,
  verifyPasswordResetOtp,
  resendLoginChallenge,
  startLoginChallenge,
  verifyLoginChallenge,
} from '../services/otpService';
import { getSettings } from '../services/settingsService';
import { currentUser } from '../middleware/auth';

export const BCRYPT_ROUNDS = env.isTest ? 4 : 12;
// Compared against when the email is unknown so login timing does not reveal registered accounts.
const DUMMY_HASH = bcrypt.hashSync('kairo-dummy-password', BCRYPT_ROUNDS);

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function startSession(req: Request, res: Response, user: Pick<IUser, '_id' | 'role'>) {
  const accessToken = signAccessToken(user._id.toString(), user.role);
  const refreshToken = await issueRefreshToken(user._id, req);
  setAuthCookies(res, accessToken, refreshToken);
}

/** Emails a new verification OTP (used on registration and email change). */
export async function createVerificationToken(user: Pick<IUser, '_id' | 'email' | 'name'>) {
  return issueEmailVerificationOtp(user, true);
}

export async function register(req: Request, res: Response) {
  const settings = await getSettings();
  if (!settings.registrationEnabled) throw ApiError.forbidden('Registration is currently disabled', 'REGISTRATION_DISABLED');

  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({
    name,
    email,
    password: await hashPassword(password),
    role: env.adminEmails.includes(email) ? 'admin' : 'user',
  });
  const otp = await createVerificationToken(user);
  await startSession(req, res, user);
  res.status(201).json({ user: serializeUser(user), verification: otp });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const user = await User.findOne({ email }).select('+password');
  const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !ok) throw ApiError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  if (user.blocked) throw ApiError.forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');

  if (user.twoFactorEnabled) {
    // Password is right, but a second factor is required: no session yet.
    const challenge = await startLoginChallenge(user);
    res.json({ twoFactorRequired: true, ...challenge });
    return;
  }
  await completeSignIn(req, res, user);
}

async function completeSignIn(req: Request, res: Response, user: UserDoc) {
  const newDevice = await isNewDevice(user._id, req);
  user.lastActiveAt = new Date();
  await user.save();
  await startSession(req, res, user);
  if (newDevice) alertNewSignIn(user, req);
  res.json({ user: serializeUser(user) });
}

/** POST /auth/login/verify — second step of two-step sign-in. */
export async function loginVerify(req: Request, res: Response) {
  const { challengeToken, code } = req.body as { challengeToken: string; code: string };
  const user = await verifyLoginChallenge(challengeToken, code);
  await completeSignIn(req, res, user);
}

/** POST /auth/login/resend — new sign-in code for a pending challenge. */
export async function loginResend(req: Request, res: Response) {
  const result = await resendLoginChallenge((req.body as { challengeToken: string }).challengeToken);
  res.json({ ok: true, ...result });
}

export async function logout(req: Request, res: Response) {
  await revokeRefreshToken(readRefreshCookie(req));
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function refresh(req: Request, res: Response) {
  const token = readRefreshCookie(req);
  if (!token) throw ApiError.unauthorized('No session', 'NO_REFRESH');
  try {
    const { userId, refreshToken } = await rotateRefreshToken(token, req);
    const user = await User.findById(userId);
    if (!user) throw ApiError.unauthorized('Account no longer exists', 'INVALID_REFRESH');
    if (user.blocked) {
      await revokeAllUserSessions(user._id);
      throw ApiError.forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');
    }
    setAuthCookies(res, signAccessToken(user._id.toString(), user.role), refreshToken);
    res.json({ user: serializeUser(user) });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

/**
 * GET /api/auth/session — like /me, but never 401s: returns { user: null } when signed out.
 * Used on app start so anonymous visitors don't get console errors. Silently renews an
 * expired access token from the refresh cookie (sent because both live under /api/auth).
 */
export async function session(req: Request, res: Response) {
  const header = req.get('authorization');
  const access = header?.startsWith('Bearer ') ? header.slice(7).trim() : (req.cookies?.[ACCESS_COOKIE] as string | undefined);
  if (access) {
    try {
      const payload = verifyAccessToken(access);
      const user = await User.findById(payload.sub);
      if (user && !user.blocked) {
        res.json({ user: serializeUser(user) });
        return;
      }
    } catch {
      /* expired or invalid: fall through to the refresh cookie */
    }
  }
  const token = readRefreshCookie(req);
  if (token) {
    try {
      const { userId, refreshToken } = await rotateRefreshToken(token, req);
      const user = await User.findById(userId);
      if (user && !user.blocked) {
        setAuthCookies(res, signAccessToken(user._id.toString(), user.role), refreshToken);
        res.json({ user: serializeUser(user) });
        return;
      }
    } catch {
      /* invalid session */
    }
    clearAuthCookies(res);
  }
  res.json({ user: null });
}

export async function me(req: Request, res: Response) {
  res.json({ user: serializeUser(currentUser(req) as IUser) });
}

/** GET /api/auth/config — public auth settings the UI needs before sign-in. */
export async function authConfig(_req: Request, res: Response) {
  const settings = await getSettings();
  res.json({
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    registrationEnabled: settings.registrationEnabled,
    otp: { length: OTP_LENGTH, ttlMinutes: OTP_TTL_MINUTES, maxAttempts: OTP_MAX_ATTEMPTS, resendCooldownSeconds: RESEND_COOLDOWN_SECONDS },
  });
}

/** Step 1: email a 6-digit reset code. Same response whether or not the account exists. */
export async function forgotPassword(req: Request, res: Response) {
  await requestPasswordResetOtp((req.body as { email: string }).email);
  res.json({
    ok: true,
    message: 'If an account exists for that email, we sent a 6-digit code.',
    expiresInSeconds: OTP_TTL_MINUTES * 60,
    resendInSeconds: RESEND_COOLDOWN_SECONDS,
  });
}

/** Step 2: exchange the code for a short-lived, single-use reset token. */
export async function verifyResetCode(req: Request, res: Response) {
  const { email, code } = req.body as { email: string; code: string };
  const resetToken = await verifyPasswordResetOtp(email, code);
  res.json({ ok: true, resetToken, expiresInSeconds: 15 * 60 });
}

/** Step 3: set the new password with the reset token. Signs out every session. */
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token: string; password: string };
  const user = await consumeResetToken(token);
  user.password = await hashPassword(password);
  user.passwordChangedAt = new Date();
  // Receiving the code proves control of the inbox.
  user.emailVerified = true;
  await user.save();
  await revokeAllUserSessions(user._id);
  alertPasswordChanged(user);
  clearAuthCookies(res);
  res.json({ ok: true, message: 'Password updated. You can now sign in.' });
}

/** Verifies the signed-in user's email with the 6-digit code. */
export async function verifyEmail(req: Request, res: Response) {
  const authUser = currentUser(req);
  if (authUser.emailVerified) {
    res.json({ ok: true, user: serializeUser(authUser as IUser) });
    return;
  }
  const user = await verifyEmailOtp(authUser, (req.body as { code: string }).code);
  res.json({ ok: true, user: serializeUser(user!) });
}

export async function resendVerification(req: Request, res: Response) {
  const user = currentUser(req);
  if (user.emailVerified) {
    res.json({ ok: true, message: 'Email already verified' });
    return;
  }
  const otp = await issueEmailVerificationOtp(user);
  res.json({ ok: true, message: 'A new code has been sent', ...otp });
}

export async function listSessions(req: Request, res: Response) {
  const user = currentUser(req);
  const currentToken = readRefreshCookie(req);
  const currentHash = currentToken ? hashForSession(currentToken) : null;
  const tokens = await RefreshToken.find({ userId: user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .lean();
  res.json({
    sessions: tokens.map((t) => ({
      id: t.family,
      userAgent: t.userAgent,
      ip: t.ip,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      current: t.tokenHash === currentHash,
    })),
  });
}

export async function revokeSession(req: Request, res: Response) {
  const user = currentUser(req);
  const family = String(req.params.id ?? '');
  if (!/^[\w-]{10,64}$/.test(family)) throw ApiError.badRequest('Invalid session id');
  await RefreshToken.updateMany({ userId: user._id, family, revokedAt: null }, { revokedAt: new Date() });
  res.json({ ok: true });
}

export async function revokeOtherSessions(req: Request, res: Response) {
  const user = currentUser(req);
  const currentToken = readRefreshCookie(req);
  const current = currentToken ? await RefreshToken.findOne({ tokenHash: hashForSession(currentToken) }) : null;
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null, ...(current ? { family: { $ne: current.family } } : {}) },
    { revokedAt: new Date() },
  );
  res.json({ ok: true });
}
