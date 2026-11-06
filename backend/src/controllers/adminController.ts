import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { User, serializeUser, type IUser } from '../models/User';
import { Conversation, serializeConversation, type IConversation } from '../models/Conversation';
import { Message, type IMessage } from '../models/Message';
import { Feedback } from '../models/Feedback';
import { UsageLog } from '../models/UsageLog';
import { currentUser } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { escapeRegex } from '../utils/strings';
import { getSettings, updateSettings } from '../services/settingsService';
import { listProviders } from '../services/ai/registry';
import { revokeAllUserSessions } from '../services/tokenService';
import { purgeUserData } from './settingsController';
import { logger } from '../utils/logger';
import type { listUsersQuery, paginationQuery, updateAppSettingsSchema, usageQuery } from '../validators/admin';

const DAY = 24 * 60 * 60 * 1000;

export async function dashboard(_req: Request, res: Response) {
  const now = Date.now();
  const since24h = new Date(now - DAY);
  const since7d = new Date(now - 7 * DAY);
  const since30d = new Date(now - 30 * DAY);

  const [totalUsers, activeUsers24h, activeUsers7d, blockedUsers, newUsers7d, totalConversations, totalMessages, messages24h, usageAll, usage30d, feedback, daily] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: since24h } }),
      User.countDocuments({ lastActiveAt: { $gte: since7d } }),
      User.countDocuments({ blocked: true }),
      User.countDocuments({ createdAt: { $gte: since7d } }),
      Conversation.countDocuments(),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: since24h } }),
      UsageLog.aggregate<{ requests: number; tokens: number; prompt: number; completion: number; errors: number }>([
        {
          $group: {
            _id: null,
            requests: { $sum: 1 },
            tokens: { $sum: '$totalTokens' },
            prompt: { $sum: '$promptTokens' },
            completion: { $sum: '$completionTokens' },
            errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
          },
        },
      ]),
      UsageLog.aggregate<{ requests: number; tokens: number }>([
        { $match: { createdAt: { $gte: since30d } } },
        { $group: { _id: null, requests: { $sum: 1 }, tokens: { $sum: '$totalTokens' } } },
      ]),
      Feedback.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$rating', count: { $sum: 1 } } }]),
      UsageLog.aggregate<{ _id: string; requests: number; tokens: number }>([
        { $match: { createdAt: { $gte: new Date(now - 14 * DAY) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            requests: { $sum: 1 },
            tokens: { $sum: '$totalTokens' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

  res.json({
    stats: {
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      blockedUsers,
      newUsers7d,
      totalConversations,
      totalMessages,
      messages24h,
      aiRequests: usageAll[0]?.requests ?? 0,
      aiErrors: usageAll[0]?.errors ?? 0,
      totalTokens: usageAll[0]?.tokens ?? 0,
      promptTokens: usageAll[0]?.prompt ?? 0,
      completionTokens: usageAll[0]?.completion ?? 0,
      aiRequests30d: usage30d[0]?.requests ?? 0,
      tokens30d: usage30d[0]?.tokens ?? 0,
      likes: feedback.find((f) => f._id === 'like')?.count ?? 0,
      dislikes: feedback.find((f) => f._id === 'dislike')?.count ?? 0,
    },
    daily: fillDays(daily, 14),
    providers: listProviders(),
  });
}

function fillDays(rows: { _id: string; requests: number; tokens: number }[], days: number) {
  const map = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    out.push({ date: d, requests: map.get(d)?.requests ?? 0, tokens: map.get(d)?.tokens ?? 0 });
  }
  return out;
}

export async function listUsers(req: Request, res: Response) {
  const { search, role, status, page, limit } = req.query as unknown as z.infer<typeof listUsersQuery>;
  const filter: Record<string, unknown> = {};
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (role) filter.role = role;
  if (status) filter.blocked = status === 'blocked';

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean<IUser[]>(),
    User.countDocuments(filter),
  ]);
  const ids = users.map((u) => u._id);
  const [convCounts, tokenSums] = await Promise.all([
    Conversation.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', count: { $sum: 1 } } }]),
    UsageLog.aggregate<{ _id: Types.ObjectId; tokens: number }>([{ $match: { userId: { $in: ids } } }, { $group: { _id: '$userId', tokens: { $sum: '$totalTokens' } } }]),
  ]);
  const convMap = new Map(convCounts.map((c) => [c._id.toString(), c.count]));
  const tokMap = new Map(tokenSums.map((t) => [t._id.toString(), t.tokens]));
  res.json({
    users: users.map((u) => ({
      ...serializeUser(u),
      conversationCount: convMap.get(u._id.toString()) ?? 0,
      tokensUsed: tokMap.get(u._id.toString()) ?? 0,
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function updateUser(req: Request, res: Response) {
  const admin = currentUser(req);
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  const { blocked, role, emailVerified } = req.body as { blocked?: boolean; role?: 'user' | 'admin'; emailVerified?: boolean };

  if (target._id.equals(admin._id) && (blocked === true || role === 'user')) {
    throw ApiError.badRequest('You cannot block or demote your own account');
  }
  if (blocked !== undefined) target.blocked = blocked;
  if (role !== undefined) target.role = role;
  if (emailVerified !== undefined) target.emailVerified = emailVerified;
  await target.save();
  if (blocked) await revokeAllUserSessions(target._id);
  logger.info(`Admin ${admin.email} updated user ${target.email}: ${JSON.stringify(req.body)}`);
  res.json({ user: serializeUser(target) });
}

export async function deleteUser(req: Request, res: Response) {
  const admin = currentUser(req);
  const target = await User.findById(req.params.id);
  if (!target) throw ApiError.notFound('User not found');
  if (target._id.equals(admin._id)) throw ApiError.badRequest('Delete your own account from Settings instead');
  await purgeUserData(target._id);
  logger.info(`Admin ${admin.email} deleted user ${target.email}`);
  res.json({ ok: true });
}

/** Conversation metadata only (titles, counts). Content requires the privacy toggle. */
export async function listConversations(req: Request, res: Response) {
  const { page, limit, userId, search } = req.query as unknown as z.infer<typeof paginationQuery>;
  const filter: Record<string, unknown> = {};
  if (userId) {
    if (!Types.ObjectId.isValid(userId)) throw ApiError.badRequest('Invalid user id');
    filter.userId = new Types.ObjectId(userId);
  }
  if (search) filter.title = new RegExp(escapeRegex(search), 'i');
  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'name email').lean(),
    Conversation.countDocuments(filter),
  ]);
  const settings = await getSettings();
  res.json({
    conversations: items.map((c) => {
      const owner = c.userId as unknown as { _id: Types.ObjectId; name: string; email: string } | null;
      return {
        ...serializeConversation({ ...c, userId: owner?._id ?? (c.userId as Types.ObjectId) } as IConversation),
        user: owner ? { id: owner._id.toString(), name: owner.name, email: owner.email } : null,
      };
    }),
    contentAccess: settings.allowAdminConversationAccess,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function getConversation(req: Request, res: Response) {
  const admin = currentUser(req);
  const settings = await getSettings();
  if (!settings.allowAdminConversationAccess) {
    throw ApiError.forbidden('Viewing conversation content is disabled by the privacy settings', 'PRIVACY_RESTRICTED');
  }
  const conversation = await Conversation.findById(req.params.id).lean<IConversation>();
  if (!conversation) throw ApiError.notFound('Conversation not found');
  const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1, _id: 1 }).limit(1000).lean<IMessage[]>();
  logger.warn(`AUDIT: admin ${admin.email} viewed conversation ${conversation._id.toString()}`);
  res.json({
    conversation: serializeConversation(conversation),
    messages: messages.map((m) => ({
      id: m._id.toString(),
      role: m.role,
      content: m.content,
      status: m.status,
      model: m.model,
      tokenUsage: m.tokenUsage,
      createdAt: m.createdAt,
    })),
  });
}

export async function getAppSettings(_req: Request, res: Response) {
  res.json({ settings: await getSettings(true), providers: listProviders() });
}

export async function patchAppSettings(req: Request, res: Response) {
  const admin = currentUser(req);
  const patch = req.body as z.infer<typeof updateAppSettingsSchema>;
  const current = await getSettings(true);
  const models = patch.models ?? current.models;
  const defaultModel = patch.defaultModel ?? current.defaultModel;
  const def = models.find((m) => m.id === defaultModel);
  if (!def || !def.enabled) throw ApiError.badRequest('The default model must exist and be enabled');
  const providers = new Set(listProviders().map((p) => p.name));
  const unknown = models.find((m) => !providers.has(m.provider));
  if (unknown) throw ApiError.badRequest(`Unknown provider "${unknown.provider}" for model ${unknown.id}`);

  const updated = await updateSettings(patch as Parameters<typeof updateSettings>[0]);
  logger.info(`Admin ${admin.email} updated app settings`);
  res.json({ settings: updated });
}

export async function usage(req: Request, res: Response) {
  const { days } = req.query as unknown as z.infer<typeof usageQuery>;
  const since = new Date(Date.now() - days * DAY);
  const [daily, byModel, topUsers] = await Promise.all([
    UsageLog.aggregate<{ _id: string; requests: number; tokens: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, requests: { $sum: 1 }, tokens: { $sum: '$totalTokens' } } },
      { $sort: { _id: 1 } },
    ]),
    UsageLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$model',
          requests: { $sum: 1 },
          tokens: { $sum: '$totalTokens' },
          promptTokens: { $sum: '$promptTokens' },
          completionTokens: { $sum: '$completionTokens' },
          errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
          avgLatencyMs: { $avg: '$latencyMs' },
        },
      },
      { $sort: { tokens: -1 } },
    ]),
    UsageLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$userId', requests: { $sum: 1 }, tokens: { $sum: '$totalTokens' } } },
      { $sort: { tokens: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { requests: 1, tokens: 1, name: '$user.name', email: '$user.email' } },
    ]),
  ]);
  res.json({
    days,
    daily: fillDays(daily, Math.min(days, 90)),
    byModel: byModel.map((m) => ({ model: m._id, ...m, _id: undefined, avgLatencyMs: Math.round(m.avgLatencyMs ?? 0) })),
    topUsers: topUsers.map((u) => ({ userId: String(u._id), name: u.name ?? 'Deleted user', email: u.email ?? '', requests: u.requests, tokens: u.tokens })),
  });
}

export async function listFeedback(req: Request, res: Response) {
  const { page, limit, rating } = req.query as unknown as z.infer<typeof paginationQuery>;
  const filter: Record<string, unknown> = rating ? { rating } : {};
  const settings = await getSettings();
  const [items, total] = await Promise.all([
    Feedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'name email').lean(),
    Feedback.countDocuments(filter),
  ]);
  // The rated answer is shown only when admins are allowed to see conversation content.
  const messages = settings.allowAdminConversationAccess
    ? await Message.find({ _id: { $in: items.map((f) => f.messageId) } }).select('content').lean()
    : [];
  const contentMap = new Map(messages.map((m) => [m._id.toString(), m.content]));
  res.json({
    feedback: items.map((f) => {
      const owner = f.userId as unknown as { _id: Types.ObjectId; name: string; email: string } | null;
      return {
        id: f._id.toString(),
        rating: f.rating,
        comment: f.comment,
        model: f.model,
        createdAt: f.createdAt,
        conversationId: f.conversationId.toString(),
        user: owner ? { id: owner._id.toString(), name: owner.name, email: owner.email } : null,
        excerpt: contentMap.get(f.messageId.toString())?.slice(0, 300) ?? null,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}
