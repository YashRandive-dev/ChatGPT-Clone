import crypto from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { hashToken, randomToken } from '../utils/crypto';
import { logger } from '../utils/logger';
import { EmailVerificationToken } from '../models/EmailVerificationToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { User, type IUser } from '../models/User';
import { sendLoginOtpEmail, sendPasswordResetOtpEmail, sendVerificationOtpEmail } from './emailService';
import { LoginChallenge } from '../models/LoginChallenge';

function deliver(sending: Promise<void>, what: string) {
  sending.catch((err) => logger.error(`Failed to send ${what} email (check the SMTP_* settings)`, err));
}

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

type Purpose = 'verify' | 'reset' | 'login';

/** Cryptographically random, zero-padded numeric code. */
export function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

/**
 * Codes are short, so a plain hash could be brute-forced offline if the DB leaked.
 * A keyed HMAC bound to the user and purpose prevents that.
 */
export function hashOtp(purpose: Purpose, userId: Types.ObjectId | string, code: string) {
  return crypto.createHmac('sha256', env.COOKIE_SECRET).update(`${purpose}:${String(userId)}:${code}`).digest('hex');
}

function codesMatch(expectedHash: string, actualHash: string) {
  const a = Buffer.from(expectedHash, 'hex');
  const b = Buffer.from(actualHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cooldownLeft(lastSentAt: Date) {
  return Math.max(0, Math.ceil((lastSentAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000));
}

const expiry = () => new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

export interface OtpIssueResult {
  expiresInSeconds: number;
  resendInSeconds: number;
}

// ---------------- Email verification ----------------

/** Sends a fresh verification code. Enforces the resend cooldown unless `force` is set. */
export async function issueEmailVerificationOtp(user: Pick<IUser, '_id' | 'email' | 'name'>, force = false): Promise<OtpIssueResult> {
  const existing = await EmailVerificationToken.findOne({ userId: user._id });
  if (existing && !force && existing.email === user.email) {
    const wait = cooldownLeft(existing.lastSentAt);
    if (wait > 0) throw new ApiError(429, `Please wait ${wait}s before requesting another code.`, 'RESEND_COOLDOWN', { retryAfter: wait });
  }
  const code = generateOtp();
  await EmailVerificationToken.findOneAndUpdate(
    { userId: user._id },
    { email: user.email, codeHash: hashOtp('verify', user._id, code), attempts: 0, expiresAt: expiry(), lastSentAt: new Date() },
    { upsert: true, setDefaultsOnInsert: true },
  );
  // Delivered in the background: a slow or unreachable mail server must never hold up the request.
  deliver(sendVerificationOtpEmail(user.email, user.name, code, OTP_TTL_MINUTES), 'verification code');
  return { expiresInSeconds: OTP_TTL_MINUTES * 60, resendInSeconds: RESEND_COOLDOWN_SECONDS };
}

export async function verifyEmailOtp(user: Pick<IUser, '_id' | 'email'>, code: string) {
  const record = await EmailVerificationToken.findOne({ userId: user._id });
  if (!record || record.expiresAt < new Date() || record.email !== user.email) {
    throw new ApiError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many incorrect attempts. Request a new code.', 'TOO_MANY_ATTEMPTS');
  }
  if (!codesMatch(record.codeHash, hashOtp('verify', user._id, code))) {
    record.attempts += 1;
    await record.save();
    const attemptsLeft = OTP_MAX_ATTEMPTS - record.attempts;
    if (attemptsLeft <= 0) throw new ApiError(429, 'Too many incorrect attempts. Request a new code.', 'TOO_MANY_ATTEMPTS');
    throw new ApiError(400, `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`, 'INVALID_CODE', { attemptsLeft });
  }
  await EmailVerificationToken.deleteOne({ _id: record._id });
  return User.findByIdAndUpdate(user._id, { emailVerified: true }, { returnDocument: 'after' });
}

// ---------------- Password reset ----------------

/**
 * Emails a reset code if the account exists. Silent on unknown emails and during the
 * cooldown so the response never reveals whether an email is registered.
 */
export async function requestPasswordResetOtp(email: string) {
  const user = await User.findOne({ email });
  if (!user || user.blocked) return;
  const existing = await PasswordResetToken.findOne({ userId: user._id });
  if (existing && cooldownLeft(existing.lastSentAt) > 0) return;
  const code = generateOtp();
  await PasswordResetToken.findOneAndUpdate(
    { userId: user._id },
    {
      codeHash: hashOtp('reset', user._id, code),
      attempts: 0,
      expiresAt: expiry(),
      lastSentAt: new Date(),
      verifiedAt: null,
      resetTokenHash: null,
      resetExpiresAt: null,
      usedAt: null,
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
  // Delivered in the background: a slow or unreachable mail server must never hold up the request.
  deliver(sendPasswordResetOtpEmail(user.email, user.name, code, OTP_TTL_MINUTES), 'password reset code');
}

/** Exchanges a correct reset code for a short-lived, single-use reset token. */
export async function verifyPasswordResetOtp(email: string, code: string): Promise<string> {
  const invalid = () => new ApiError(400, 'Incorrect or expired code.', 'INVALID_CODE');
  const user = await User.findOne({ email });
  if (!user || user.blocked) throw invalid();
  const record = await PasswordResetToken.findOne({ userId: user._id, usedAt: null });
  if (!record || record.expiresAt < new Date()) throw new ApiError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');
  if (record.attempts >= OTP_MAX_ATTEMPTS) throw new ApiError(429, 'Too many incorrect attempts. Request a new code.', 'TOO_MANY_ATTEMPTS');
  if (!codesMatch(record.codeHash, hashOtp('reset', user._id, code))) {
    record.attempts += 1;
    await record.save();
    const attemptsLeft = OTP_MAX_ATTEMPTS - record.attempts;
    if (attemptsLeft <= 0) throw new ApiError(429, 'Too many incorrect attempts. Request a new code.', 'TOO_MANY_ATTEMPTS');
    throw new ApiError(400, `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`, 'INVALID_CODE', { attemptsLeft });
  }
  const resetToken = randomToken(32);
  record.verifiedAt = new Date();
  record.resetTokenHash = hashToken(resetToken);
  record.resetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  // The code itself can no longer be reused.
  record.attempts = OTP_MAX_ATTEMPTS;
  await record.save();
  return resetToken;
}

/** Consumes a reset token; returns the user whose password may be changed. */
export async function consumeResetToken(token: string) {
  const record = await PasswordResetToken.findOne({ resetTokenHash: hashToken(token), usedAt: null });
  if (!record || !record.resetExpiresAt || record.resetExpiresAt < new Date()) {
    throw new ApiError(400, 'Your reset session has expired. Start again.', 'RESET_EXPIRED');
  }
  const user = await User.findById(record.userId);
  if (!user || user.blocked) throw new ApiError(400, 'Your reset session has expired. Start again.', 'RESET_EXPIRED');
  record.usedAt = new Date();
  await record.save();
  return user;
}

// ---------------- Two-step sign-in ----------------

/** "j***@example.com" – shown on the sign-in code screen. */
export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(local.length - 1, 6)))}@${domain}`;
}

async function sendLoginCode(user: Pick<IUser, '_id' | 'email' | 'name'>) {
  const code = generateOtp();
  // Delivered in the background: a slow or unreachable mail server must never hold up the request.
  deliver(sendLoginOtpEmail(user.email, user.name, code, OTP_TTL_MINUTES), 'sign-in code');
  return hashOtp('login', user._id, code);
}

/** Creates a challenge after a correct password when two-step verification is on. */
export async function startLoginChallenge(user: Pick<IUser, '_id' | 'email' | 'name'>) {
  await LoginChallenge.deleteMany({ userId: user._id });
  const token = randomToken(32);
  await LoginChallenge.create({
    userId: user._id,
    tokenHash: hashToken(token),
    codeHash: await sendLoginCode(user),
    expiresAt: expiry(),
  });
  return { challengeToken: token, email: maskEmail(user.email), expiresInSeconds: OTP_TTL_MINUTES * 60, resendInSeconds: RESEND_COOLDOWN_SECONDS };
}

async function findChallenge(token: string) {
  const challenge = await LoginChallenge.findOne({ tokenHash: hashToken(token) });
  if (!challenge || challenge.expiresAt < new Date()) {
    throw new ApiError(400, 'This sign-in attempt has expired. Sign in again.', 'CHALLENGE_EXPIRED');
  }
  return challenge;
}

export async function resendLoginChallenge(token: string) {
  const challenge = await findChallenge(token);
  const wait = cooldownLeft(challenge.lastSentAt);
  if (wait > 0) throw new ApiError(429, `Please wait ${wait}s before requesting another code.`, 'RESEND_COOLDOWN', { retryAfter: wait });
  const user = await User.findById(challenge.userId);
  if (!user || user.blocked) throw new ApiError(400, 'This sign-in attempt has expired. Sign in again.', 'CHALLENGE_EXPIRED');
  challenge.codeHash = await sendLoginCode(user);
  challenge.attempts = 0;
  challenge.lastSentAt = new Date();
  challenge.expiresAt = expiry();
  await challenge.save();
  return { expiresInSeconds: OTP_TTL_MINUTES * 60, resendInSeconds: RESEND_COOLDOWN_SECONDS };
}

/** Completes a two-step sign-in; returns the user to start a session for. */
export async function verifyLoginChallenge(token: string, code: string) {
  const challenge = await findChallenge(token);
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await challenge.deleteOne();
    throw new ApiError(429, 'Too many incorrect attempts. Sign in again.', 'TOO_MANY_ATTEMPTS');
  }
  if (!codesMatch(challenge.codeHash, hashOtp('login', challenge.userId, code))) {
    challenge.attempts += 1;
    await challenge.save();
    const attemptsLeft = OTP_MAX_ATTEMPTS - challenge.attempts;
    if (attemptsLeft <= 0) {
      await challenge.deleteOne();
      throw new ApiError(429, 'Too many incorrect attempts. Sign in again.', 'TOO_MANY_ATTEMPTS');
    }
    throw new ApiError(400, `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`, 'INVALID_CODE', { attemptsLeft });
  }
  await challenge.deleteOne();
  const user = await User.findById(challenge.userId);
  if (!user) throw new ApiError(400, 'This sign-in attempt has expired. Sign in again.', 'CHALLENGE_EXPIRED');
  if (user.blocked) throw ApiError.forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');
  return user;
}
