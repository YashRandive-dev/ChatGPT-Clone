import type { Request, Response } from 'express';
import { Message, type IMessage } from '../models/Message';
import { Conversation, serializeConversation, type IConversation } from '../models/Conversation';
import { Feedback } from '../models/Feedback';
import { currentUser, type AuthUser } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { SSEStream } from '../utils/sse';
import {
  afterFilter,
  assertWithinUsageLimits,
  claimAttachments,
  createConversationFor,
  deleteMessagesWhere,
  filesFor,
  generateReply,
  getOwnedConversation,
  getOwnedMessage,
  pickModelForChat,
  recountConversation,
  serializeMessage,
  type GenerationResult,
} from '../services/chatService';
import { getSettings } from '../services/settingsService';
import type { ModelConfig, IAppSettings } from '../models/AppSettings';

interface SendBody {
  conversationId?: string;
  content: string;
  model?: string;
  attachments: string[];
}

interface Prepared {
  user: AuthUser;
  settings: IAppSettings;
  conversation: IConversation;
  userMessage: IMessage;
  assistant: IMessage;
  model: ModelConfig;
  created: boolean;
}

/** Steps 1-5 of the pipeline: validate limits, verify ownership, persist the user message. */
async function prepareSend(req: Request): Promise<Prepared> {
  const user = currentUser(req);
  const settings = await getSettings();
  const body = req.body as SendBody;
  await assertWithinUsageLimits(user, settings);

  let conversation: IConversation;
  let created = false;
  if (body.conversationId) {
    conversation = (await getOwnedConversation(body.conversationId, user._id)).toObject();
  } else {
    const model = pickModelForChat(settings, user, body.model);
    conversation = (await createConversationFor(user, body.content, model.id)).toObject();
    created = true;
  }
  const model = pickModelForChat(settings, user, body.model, conversation.model);

  let attachments;
  try {
    attachments = await claimAttachments(body.attachments, user, conversation._id);
  } catch (err) {
    if (created) await Conversation.deleteOne({ _id: conversation._id });
    throw err;
  }

  const userMessage = await Message.create({
    conversationId: conversation._id,
    userId: user._id,
    role: 'user',
    content: body.content,
    attachments,
  });
  const assistant = await Message.create({
    conversationId: conversation._id,
    userId: user._id,
    role: 'assistant',
    content: '',
    status: 'streaming',
    model: model.id,
  });
  await Conversation.updateOne({ _id: conversation._id }, { $inc: { messageCount: 2 }, lastMessageAt: new Date(), model: model.id });

  return { user, settings, conversation, userMessage: userMessage.toObject(), assistant: assistant.toObject(), model, created };
}

/** Runs generation and streams it to the client as Server-Sent Events. */
async function streamGeneration(req: Request, res: Response, p: Omit<Prepared, 'created'> & { created?: boolean }) {
  const sse = new SSEStream(res);
  const controller = new AbortController();
  // Client disconnected or pressed "stop": abort the upstream AI request.
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const conversation = await Conversation.findById(p.conversation._id).lean<IConversation>();
  const files = await filesFor([p.userMessage]);
  sse.send('meta', {
    conversation: serializeConversation(conversation ?? p.conversation),
    userMessage: serializeMessage(p.userMessage, files),
    assistantMessage: serializeMessage(p.assistant),
    created: Boolean(p.created),
  });

  let result: GenerationResult;
  try {
    result = await generateReply({
      ...p,
      signal: controller.signal,
      events: {
        onDelta: (text) => sse.send('delta', { text }),
        // Only brand-new conversations get an AI title, so regenerations never override renames.
        onTitle: p.created ? (title) => sse.send('title', { conversationId: p.conversation._id.toString(), title }) : undefined,
      },
    });
  } catch (err) {
    // Persistence failure after streaming: mark the message as failed so it can be retried.
    await Message.updateOne({ _id: p.assistant._id }, { status: 'error', error: 'The response could not be saved' });
    sse.send('error', { code: 'INTERNAL_ERROR', message: 'Something went wrong while saving the response.' });
    sse.end();
    throw err;
  }

  if (result.error) {
    sse.send('error', {
      code: result.error.code,
      message: result.error.message,
      message_record: serializeMessage(result.message),
    });
  } else {
    sse.send('done', { message: serializeMessage(result.message), stopped: result.stopped });
  }
  sse.end();
}

/** POST /api/messages/stream */
export async function streamMessage(req: Request, res: Response) {
  const prepared = await prepareSend(req);
  await streamGeneration(req, res, prepared);
}

/** POST /api/messages — non-streaming variant; returns the finished exchange as JSON. */
export async function sendMessage(req: Request, res: Response) {
  const p = await prepareSend(req);
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  let title: string | undefined;
  const result = await generateReply({ ...p, signal: controller.signal, events: { onDelta: () => undefined, onTitle: p.created ? (t) => (title = t) : undefined } });
  const conversation = await Conversation.findById(p.conversation._id).lean<IConversation>();
  const files = await filesFor([p.userMessage]);
  const payload = {
    conversation: serializeConversation(conversation!),
    userMessage: serializeMessage(p.userMessage, files),
    assistantMessage: serializeMessage(result.message),
    title,
  };
  if (result.error) {
    res.status(result.error.status >= 400 && result.error.status < 600 ? result.error.status : 502).json({
      error: { code: result.error.code, message: result.error.message },
      ...payload,
    });
    return;
  }
  res.status(201).json(payload);
}

/**
 * POST /api/messages/:id/regenerate (SSE). For an assistant message, replaces it (and
 * anything after it). For a user message (e.g. after editing), produces a fresh reply to it.
 */
export async function regenerate(req: Request, res: Response) {
  const user = currentUser(req);
  const settings = await getSettings();
  await assertWithinUsageLimits(user, settings);
  const target = await getOwnedMessage(String(req.params.id), user._id);
  const conversation = await getOwnedConversation(target.conversationId, user._id);

  let userMessage: IMessage | null;
  if (target.role === 'user') {
    userMessage = target.toObject();
    await deleteMessagesWhere({ ...afterFilter(target), userId: user._id });
  } else if (target.role === 'assistant') {
    userMessage = await Message.findOne({
      conversationId: target.conversationId,
      role: 'user',
      $or: [{ createdAt: { $lt: target.createdAt } }, { createdAt: target.createdAt, _id: { $lt: target._id } }],
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean<IMessage>();
    if (!userMessage) throw ApiError.badRequest('Nothing to regenerate from');
    await deleteMessagesWhere({ ...afterFilter(target, true), userId: user._id });
  } else throw ApiError.badRequest('This message cannot be regenerated');

  const model = pickModelForChat(settings, user, (req.body as { model?: string }).model, conversation.model);
  const assistant = await Message.create({
    conversationId: conversation._id,
    userId: user._id,
    role: 'assistant',
    content: '',
    status: 'streaming',
    model: model.id,
  });
  await recountConversation(conversation._id);
  await streamGeneration(req, res, {
    user,
    settings,
    conversation: conversation.toObject(),
    userMessage,
    assistant: assistant.toObject(),
    model,
  });
}

/** PATCH /api/messages/:id — edit a user message; later messages are discarded. */
export async function editMessage(req: Request, res: Response) {
  const user = currentUser(req);
  const message = await getOwnedMessage(String(req.params.id), user._id);
  if (message.role !== 'user') throw ApiError.badRequest('Only your own messages can be edited');
  message.content = (req.body as { content: string }).content;
  message.editedAt = new Date();
  await message.save();
  const removed = await deleteMessagesWhere({ ...afterFilter(message), userId: user._id });
  await recountConversation(message.conversationId);
  await Conversation.updateOne({ _id: message.conversationId }, { lastMessageAt: new Date() });
  const files = await filesFor([message]);
  res.json({ message: serializeMessage(message, files), removedIds: removed.map(String) });
}

/** DELETE /api/messages/:id — deletes a message; for a user message also its direct reply. */
export async function deleteMessage(req: Request, res: Response) {
  const user = currentUser(req);
  const message = await getOwnedMessage(String(req.params.id), user._id);
  const ids = [message._id];
  if (message.role === 'user') {
    const next = await Message.findOne(afterFilter(message)).sort({ createdAt: 1, _id: 1 }).lean<IMessage>();
    if (next && next.role === 'assistant') ids.push(next._id);
  }
  await deleteMessagesWhere({ _id: { $in: ids }, userId: user._id });
  await recountConversation(message.conversationId);
  res.json({ ok: true, removedIds: ids.map(String) });
}

/** POST /api/messages/:id/feedback — like / dislike (null clears). */
export async function submitFeedback(req: Request, res: Response) {
  const user = currentUser(req);
  const message = await getOwnedMessage(String(req.params.id), user._id);
  if (message.role !== 'assistant') throw ApiError.badRequest('Feedback can only be given on AI responses');
  const { rating, comment } = req.body as { rating: 'like' | 'dislike' | null; comment?: string };

  if (rating === null) {
    await Feedback.deleteOne({ userId: user._id, messageId: message._id });
    message.feedback = { rating: null, comment: null };
  } else {
    await Feedback.findOneAndUpdate(
      { userId: user._id, messageId: message._id },
      { rating, comment: comment ?? null, conversationId: message.conversationId, model: message.model },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    message.feedback = { rating, comment: comment ?? null };
  }
  await message.save();
  res.json({ message: serializeMessage(message) });
}
