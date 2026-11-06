import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, serializeUser, type IUser } from '../models/User';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { FileModel } from '../models/File';
import { Feedback } from '../models/Feedback';
import { UsageLog } from '../models/UsageLog';
import { RefreshToken } from '../models/RefreshToken';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { EmailVerificationToken } from '../models/EmailVerificationToken';
import { currentUser } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { getSettings, publicModelList, resolveModel } from '../services/settingsService';
import { clearAuthCookies, revokeAllUserSessions, issueRefreshToken, setAuthCookies, signAccessToken } from '../services/tokenService';
import { createVerificationToken, hashPassword } from './authController';
import { detectKind, removeStored, storagePath, uploadRoot } from '../services/fileService';
import { LoginChallenge } from '../models/LoginChallenge';
import { alertPasswordChanged } from '../services/securityNotifier';
import { randomToken } from '../utils/crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Types } from 'mongoose';

/** GET /api/settings — the user's preferences plus the models they can choose from. */
export async function getUserSettings(req: Request, res: Response) {
  const user = currentUser(req);
  const settings = await getSettings();
  const usageSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [messagesToday] = await Promise.all([
    Message.countDocuments({ userId: user._id, role: 'user', createdAt: { $gte: usageSince } }),
  ]);
  res.json({
    preferences: user.preferences,
    ...publicModelList(settings),
    appName: settings.appName,
    limits: { dailyMessagesPerUser: settings.limits.dailyMessagesPerUser, messagesToday },
  });
}

/** PATCH /api/settings — update preferences. */
export async function updateUserSettings(req: Request, res: Response) {
  const user = currentUser(req);
  const patch = req.body as Partial<IUser['preferences']>;
  if (patch.defaultModel) {
    const settings = await getSettings();
    if (!resolveModel(settings, patch.defaultModel)) throw ApiError.badRequest('That model is not available', { field: 'defaultModel' });
  }
  const $set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) $set[`preferences.${k}`] = v;
  const updated = await User.findByIdAndUpdate(user._id, { $set }, { returnDocument: 'after', runValidators: true });
  res.json({ preferences: updated!.preferences, user: serializeUser(updated!) });
}

/** GET /api/models — models available to the user (from backend configuration). */
export async function listModels(_req: Request, res: Response) {
  res.json(publicModelList(await getSettings()));
}

/** PATCH /api/users/me — name, avatar, email (email change requires password + re-verification). */
export async function updateProfile(req: Request, res: Response) {
  const authUser = currentUser(req);
  const { name, email, avatar, currentPassword } = req.body as { name?: string; email?: string; avatar?: string | null; currentPassword?: string };
  const user = await User.findById(authUser._id).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  if (name !== undefined) user.name = name;
  if (avatar !== undefined) user.avatar = avatar;
  let emailChanged = false;
  if (email !== undefined && email !== user.email) {
    // A verified email is the account's identity (sign-in, recovery, two-step codes): it is permanent.
    if (user.emailVerified) {
      throw ApiError.forbidden('Your email address is verified and can no longer be changed.', 'EMAIL_LOCKED');
    }
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
      throw ApiError.badRequest('Enter your current password to change your email', { field: 'currentPassword' });
    }
    if (await User.exists({ email, _id: { $ne: user._id } })) throw ApiError.conflict('That email is already in use');
    user.email = email;
    user.emailVerified = false;
    emailChanged = true;
  }
  await user.save();
  if (emailChanged) await createVerificationToken(user);
  res.json({ user: serializeUser(user), emailChanged });
}

/** PATCH /api/users/me/password */
export async function changePassword(req: Request, res: Response) {
  const authUser = currentUser(req);
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await User.findById(authUser._id).select('+password');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    throw ApiError.badRequest('Current password is incorrect', { field: 'currentPassword' });
  }
  user.password = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  // Sign out every other device, keep this one signed in with a fresh session.
  await revokeAllUserSessions(user._id);
  alertPasswordChanged(user);
  setAuthCookies(res, signAccessToken(user._id.toString(), user.role), await issueRefreshToken(user._id, req));
  res.json({ ok: true });
}

export async function purgeUserData(userId: IUser['_id']) {
  const owner = await User.findById(userId).select('avatarFile').lean();
  if (owner?.avatarFile) await removeStored(owner.avatarFile);
  await LoginChallenge.deleteMany({ userId });
  const files = await FileModel.find({ userId }).lean();
  await Promise.all(files.map((f) => removeStored(f.storageName)));
  await Promise.all([
    Message.deleteMany({ userId }),
    Conversation.deleteMany({ userId }),
    FileModel.deleteMany({ userId }),
    Feedback.deleteMany({ userId }),
    UsageLog.deleteMany({ userId }),
    RefreshToken.deleteMany({ userId }),
    PasswordResetToken.deleteMany({ userId }),
    EmailVerificationToken.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });
}

/** DELETE /api/users/me — permanently deletes the account and all associated data. */
export async function deleteAccount(req: Request, res: Response) {
  const authUser = currentUser(req);
  const user = await User.findById(authUser._id).select('+password');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await bcrypt.compare((req.body as { password: string }).password, user.password))) {
    throw ApiError.badRequest('Password is incorrect', { field: 'password' });
  }
  if (user.role === 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
    throw ApiError.badRequest('You are the only administrator. Promote another admin before deleting your account.');
  }
  await purgeUserData(user._id);
  clearAuthCookies(res);
  res.json({ ok: true });
}

/** GET /api/users/me/export — downloads all of the user's conversations as JSON. */
export async function exportData(req: Request, res: Response) {
  const user = currentUser(req);
  const conversations = await Conversation.find({ userId: user._id }).sort({ createdAt: 1 }).lean();
  const messages = await Message.find({ userId: user._id }).sort({ createdAt: 1, _id: 1 }).lean();
  const files = await FileModel.find({ userId: user._id }).lean();
  const fileNames = new Map(files.map((f) => [f._id.toString(), f.originalName]));
  const byConversation = new Map<string, typeof messages>();
  for (const m of messages) {
    const key = m.conversationId.toString();
    if (!byConversation.has(key)) byConversation.set(key, []);
    byConversation.get(key)!.push(m);
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email, createdAt: user.createdAt, preferences: user.preferences },
    conversations: conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      model: c.model,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: (byConversation.get(c._id.toString()) ?? []).map((m) => ({
        role: m.role,
        content: m.content,
        model: m.model,
        attachments: m.attachments.map((a) => fileNames.get(a.toString()) ?? 'deleted file'),
        feedback: m.feedback?.rating ?? null,
        createdAt: m.createdAt,
      })),
    })),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kairo-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(payload, null, 2));
}

// ---------------- Avatar ----------------

const AVATAR_MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

/** POST /api/users/me/avatar — upload a profile picture (PNG/JPG/WEBP/GIF, max 2 MB). */
export async function uploadAvatar(req: Request, res: Response) {
  const authUser = currentUser(req);
  const file = req.file;
  if (!file) throw ApiError.badRequest('No image provided (use multipart field "avatar")');
  let ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.jpeg') ext = '.jpg';
  const detected = detectKind(file.buffer, ext === '.jpg' ? '.jpg' : ext);
  if (!detected || detected.kind !== 'image') throw ApiError.badRequest('Avatar must be a PNG, JPG, WEBP or GIF image');

  await fs.mkdir(path.join(uploadRoot(), 'avatars'), { recursive: true });
  const storageName = `avatars/${randomToken(18)}${ext}`;
  await fs.writeFile(storagePath(storageName), file.buffer, { flag: 'wx', mode: 0o600 });

  const user = await User.findById(authUser._id);
  if (!user) throw ApiError.notFound('User not found');
  const previous = user.avatarFile;
  user.avatarFile = storageName;
  user.avatar = null;
  await user.save();
  if (previous) await removeStored(previous);
  res.json({ user: serializeUser(user) });
}

/** DELETE /api/users/me/avatar — back to initials. */
export async function deleteAvatar(req: Request, res: Response) {
  const user = await User.findById(currentUser(req)._id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.avatarFile) await removeStored(user.avatarFile);
  user.avatarFile = null;
  user.avatar = null;
  await user.save();
  res.json({ user: serializeUser(user) });
}

/** GET /api/users/:id/avatar — public so <img> tags work everywhere; ids are unguessable. */
export async function getAvatar(req: Request, res: Response) {
  const id = String(req.params.id);
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('Avatar not found');
  const user = await User.findById(id).select('avatarFile').lean();
  if (!user?.avatarFile) throw ApiError.notFound('Avatar not found');
  const full = storagePath(user.avatarFile);
  try {
    await fs.access(full);
  } catch {
    throw ApiError.notFound('Avatar not found');
  }
  res.setHeader('Content-Type', AVATAR_MIME[path.extname(full)] ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  createReadStream(full).pipe(res);
}

// ---------------- Two-step verification ----------------

/** POST /api/users/me/two-factor — turn email-code sign-in on/off (password required). */
export async function setTwoFactor(req: Request, res: Response) {
  const { enabled, password } = req.body as { enabled: boolean; password: string };
  const user = await User.findById(currentUser(req)._id).select('+password');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await bcrypt.compare(password, user.password))) throw ApiError.badRequest('Password is incorrect', { field: 'password' });
  if (enabled && !user.emailVerified) {
    throw ApiError.badRequest('Verify your email address before turning on two-step verification', { field: 'emailVerified' });
  }
  user.twoFactorEnabled = enabled;
  await user.save();
  res.json({ user: serializeUser(user) });
}

// ---------------- Stats ----------------

/** GET /api/users/me/stats — personal usage summary for the profile page. */
export async function getStats(req: Request, res: Response) {
  const user = currentUser(req);
  const DAY = 86_400_000;
  const since30 = new Date(Date.now() - 30 * DAY);
  const [conversations, archived, shared, messages, sentMessages, files, likes, dislikes, tokens, daily] = await Promise.all([
    Conversation.countDocuments({ userId: user._id }),
    Conversation.countDocuments({ userId: user._id, archived: true }),
    Conversation.countDocuments({ userId: user._id, shareId: { $type: 'string' } }),
    Message.countDocuments({ userId: user._id }),
    Message.countDocuments({ userId: user._id, role: 'user' }),
    FileModel.countDocuments({ userId: user._id }),
    Feedback.countDocuments({ userId: user._id, rating: 'like' }),
    Feedback.countDocuments({ userId: user._id, rating: 'dislike' }),
    UsageLog.aggregate<{ total: number; last30: number }>([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalTokens' },
          last30: { $sum: { $cond: [{ $gte: ['$createdAt', since30] }, '$totalTokens', 0] } },
        },
      },
    ]),
    Message.aggregate<{ _id: string; count: number }>([
      { $match: { userId: user._id, role: 'user', createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
  ]);
  const byDay = new Map(daily.map((d) => [d._id, d.count]));
  const activity = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10);
    return { date, messages: byDay.get(date) ?? 0 };
  });
  res.json({
    conversations,
    archived,
    shared,
    messages,
    sentMessages,
    files,
    feedback: { likes, dislikes },
    tokens: { total: tokens[0]?.total ?? 0, last30Days: tokens[0]?.last30 ?? 0 },
    activeDays30: activity.filter((d) => d.messages > 0).length,
    activity,
    memberSince: user.createdAt,
  });
}
