import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Conversation, serializeConversation, type IConversation } from '../models/Conversation';
import { Message, type IMessage } from '../models/Message';
import { currentUser } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { escapeRegex } from '../utils/strings';
import { randomToken } from '../utils/crypto';
import { deleteConversationCascade, filesFor, getOwnedConversation, pickModel, serializeMessage } from '../services/chatService';
import { getSettings } from '../services/settingsService';
import type { z } from 'zod';
import type { getConversationQuery, listConversationsQuery } from '../validators/chat';

function encodeCursor(c: IConversation) {
  return Buffer.from(`${c.updatedAt.getTime()}_${c._id.toString()}`).toString('base64url');
}
function decodeCursor(cursor: string) {
  const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('_');
  if (!ts || !id || !Types.ObjectId.isValid(id) || Number.isNaN(Number(ts))) throw ApiError.badRequest('Invalid cursor');
  return { updatedAt: new Date(Number(ts)), id: new Types.ObjectId(id) };
}

export async function listConversations(req: Request, res: Response) {
  const user = currentUser(req);
  const { search, cursor, limit, archived } = req.query as unknown as z.infer<typeof listConversationsQuery>;
  // Archived chats are hidden from the sidebar and search unless explicitly requested.
  const filter: Record<string, unknown> = { userId: user._id, archived: archived === 'true' ? true : { $ne: true } };

  if (search) {
    // Match titles, plus conversations whose messages contain the search words.
    const regex = new RegExp(escapeRegex(search), 'i');
    const messageHits = await Message.find({ userId: user._id, $text: { $search: search } })
      .select('conversationId')
      .limit(500)
      .lean();
    const ids = [...new Set(messageHits.map((m) => m.conversationId.toString()))].map((id) => new Types.ObjectId(id));
    filter.$or = [{ title: regex }, { _id: { $in: ids } }];
  }
  if (cursor) {
    const c = decodeCursor(cursor);
    filter.$and = [{ $or: [{ updatedAt: { $lt: c.updatedAt } }, { updatedAt: c.updatedAt, _id: { $lt: c.id } }] }];
  }

  const items = await Conversation.find(filter).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).lean<IConversation[]>();
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  res.json({
    conversations: page.map(serializeConversation),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
  });
}

export async function createConversation(req: Request, res: Response) {
  const user = currentUser(req);
  const settings = await getSettings();
  const { title, model } = req.body as { title?: string; model?: string };
  const chosen = pickModel(settings, user, model);
  const conversation = await Conversation.create({ userId: user._id, title: title ?? 'New chat', model: chosen.id });
  res.status(201).json({ conversation: serializeConversation(conversation) });
}

export async function getConversation(req: Request, res: Response) {
  const user = currentUser(req);
  const conversation = await getOwnedConversation(String(req.params.id), user._id);
  const { before, limit } = req.query as unknown as z.infer<typeof getConversationQuery>;

  const filter: Record<string, unknown> = { conversationId: conversation._id };
  if (before) {
    const pivot = await Message.findOne({ _id: before, conversationId: conversation._id }).lean<IMessage>();
    if (!pivot) throw ApiError.badRequest('Invalid pagination cursor');
    filter.$or = [{ createdAt: { $lt: pivot.createdAt } }, { createdAt: pivot.createdAt, _id: { $lt: pivot._id } }];
  }
  const messages = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean<IMessage[]>();
  const hasMore = messages.length > limit;
  const page = (hasMore ? messages.slice(0, limit) : messages).reverse();
  const files = await filesFor(page);
  res.json({
    conversation: serializeConversation(conversation),
    messages: page.map((m) => serializeMessage(m, files)),
    hasMore,
  });
}

export async function updateConversation(req: Request, res: Response) {
  const user = currentUser(req);
  const conversation = await getOwnedConversation(String(req.params.id), user._id);
  const { title, model, pinned, archived } = req.body as { title?: string; model?: string; pinned?: boolean; archived?: boolean };
  if (title !== undefined) conversation.title = title;
  if (pinned !== undefined) conversation.pinned = pinned;
  if (archived !== undefined) {
    conversation.archived = archived;
    if (archived) conversation.pinned = false;
  }
  if (model !== undefined) conversation.set('model', pickModel(await getSettings(), user, model).id);
  await conversation.save();
  res.json({ conversation: serializeConversation(conversation) });
}

export async function deleteConversation(req: Request, res: Response) {
  const user = currentUser(req);
  const conversation = await getOwnedConversation(String(req.params.id), user._id);
  await deleteConversationCascade(conversation);
  res.json({ ok: true });
}

export async function deleteAllConversations(req: Request, res: Response) {
  const user = currentUser(req);
  const conversations = await Conversation.find({ userId: user._id }).select('_id').lean();
  for (const c of conversations) await deleteConversationCascade(c);
  res.json({ ok: true, deleted: conversations.length });
}

/** Creates (or returns) a public read-only share link for a conversation. */
export async function shareConversation(req: Request, res: Response) {
  const user = currentUser(req);
  const conversation = await getOwnedConversation(String(req.params.id), user._id);
  if (!conversation.shareId) {
    conversation.shareId = randomToken(18);
    await conversation.save({ timestamps: false });
  }
  res.json({ shareId: conversation.shareId });
}

export async function unshareConversation(req: Request, res: Response) {
  const user = currentUser(req);
  const conversation = await getOwnedConversation(String(req.params.id), user._id);
  conversation.shareId = null;
  await conversation.save({ timestamps: false });
  res.json({ ok: true });
}

/** Public endpoint: read a shared conversation. Attachments are omitted for privacy. */
export async function getSharedConversation(req: Request, res: Response) {
  const shareId = String(req.params.shareId ?? '');
  if (!/^[\w-]{10,64}$/.test(shareId)) throw ApiError.notFound('Shared conversation not found');
  const conversation = await Conversation.findOne({ shareId }).lean<IConversation>();
  if (!conversation) throw ApiError.notFound('Shared conversation not found');
  const messages = await Message.find({ conversationId: conversation._id, status: { $ne: 'error' } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(500)
    .lean<IMessage[]>();
  res.json({
    conversation: { title: conversation.title, model: conversation.model, createdAt: conversation.createdAt },
    messages: messages.map((m) => ({ id: m._id.toString(), role: m.role, content: m.content, createdAt: m.createdAt })),
  });
}

/** POST /api/conversations/archive-all */
export async function archiveAll(req: Request, res: Response) {
  const user = currentUser(req);
  const result = await Conversation.updateMany({ userId: user._id, archived: { $ne: true } }, { archived: true, pinned: false }, { timestamps: false });
  res.json({ ok: true, archived: result.modifiedCount });
}

/** GET /api/conversations/shared — the user's active public share links. */
export async function listShared(req: Request, res: Response) {
  const user = currentUser(req);
  const items = await Conversation.find({ userId: user._id, shareId: { $type: 'string' } }).sort({ updatedAt: -1 }).limit(200).lean<IConversation[]>();
  res.json({ conversations: items.map(serializeConversation) });
}

/** DELETE /api/conversations/shared — disable every share link. */
export async function revokeAllShared(req: Request, res: Response) {
  const user = currentUser(req);
  const result = await Conversation.updateMany({ userId: user._id, shareId: { $type: 'string' } }, { shareId: null }, { timestamps: false });
  res.json({ ok: true, revoked: result.modifiedCount });
}
