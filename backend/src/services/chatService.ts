import { Types } from 'mongoose';
import { Message, type IMessage, type TokenUsage } from '../models/Message';
import { Conversation, type IConversation } from '../models/Conversation';
import { FileModel, type IFile } from '../models/File';
import { Feedback } from '../models/Feedback';
import { UsageLog } from '../models/UsageLog';
import type { IAppSettings, ModelConfig } from '../models/AppSettings';
import type { AuthUser } from '../middleware/auth';
import { getProvider, AIProviderError, type ChatMessageInput, type ContentPart, type Usage } from './ai/registry';
import { readAsDataUrl, removeStored } from './fileService';
import { estimateTokens, titleFromMessage } from '../utils/strings';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { getSettings, resolveModel } from './settingsService';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi' };

export function serializeMessage(m: IMessage, files: Map<string, IFile> = new Map()) {
  return {
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    role: m.role,
    content: m.content,
    attachments: m.attachments
      .map((id) => files.get(id.toString()))
      .filter((f): f is IFile => Boolean(f))
      .map((f) => ({ id: f._id.toString(), name: f.originalName, mimeType: f.mimeType, kind: f.kind, size: f.size })),
    feedback: m.feedback?.rating ? { rating: m.feedback.rating, comment: m.feedback.comment } : null,
    tokenUsage: m.tokenUsage,
    model: m.model,
    status: m.status,
    error: m.error,
    editedAt: m.editedAt,
    createdAt: m.createdAt,
  };
}

export async function filesFor(messages: IMessage[]): Promise<Map<string, IFile>> {
  const ids = [...new Set(messages.flatMap((m) => m.attachments.map(String)))];
  if (!ids.length) return new Map();
  const files = await FileModel.find({ _id: { $in: ids } }).lean<IFile[]>();
  return new Map(files.map((f) => [f._id.toString(), f]));
}

/** Loads a conversation only if it belongs to the user; 404 otherwise (no existence leak). */
export async function getOwnedConversation(conversationId: string | Types.ObjectId, userId: Types.ObjectId) {
  const conversation = await Conversation.findOne({ _id: conversationId, userId });
  if (!conversation) throw ApiError.notFound('Conversation not found');
  return conversation;
}

export async function getOwnedMessage(messageId: string, userId: Types.ObjectId) {
  const message = await Message.findOne({ _id: messageId, userId });
  if (!message) throw ApiError.notFound('Message not found');
  return message;
}

/** Filter matching every message that comes after `m` in its conversation. */
export function afterFilter(m: Pick<IMessage, 'conversationId' | 'createdAt' | '_id'>, inclusive = false) {
  return {
    conversationId: m.conversationId,
    $or: [
      { createdAt: { $gt: m.createdAt } },
      { createdAt: m.createdAt, _id: inclusive ? { $gte: m._id } : { $gt: m._id } },
    ],
  };
}

export async function deleteMessagesWhere(filter: Record<string, unknown>) {
  const doomed = await Message.find(filter).select('_id').lean();
  const ids = doomed.map((d) => d._id);
  if (!ids.length) return [] as Types.ObjectId[];
  await Promise.all([Message.deleteMany({ _id: { $in: ids } }), Feedback.deleteMany({ messageId: { $in: ids } })]);
  return ids;
}

export async function recountConversation(conversationId: Types.ObjectId) {
  const count = await Message.countDocuments({ conversationId });
  await Conversation.updateOne({ _id: conversationId }, { messageCount: count });
}

/** Removes a conversation with its messages, feedback and uploaded files. */
export async function deleteConversationCascade(conversation: Pick<IConversation, '_id'>) {
  const files = await FileModel.find({ conversationId: conversation._id }).lean();
  await Promise.all(files.map((f) => removeStored(f.storageName)));
  await Promise.all([
    Message.deleteMany({ conversationId: conversation._id }),
    Feedback.deleteMany({ conversationId: conversation._id }),
    FileModel.deleteMany({ conversationId: conversation._id }),
    Conversation.deleteOne({ _id: conversation._id }),
  ]);
}

/** Enforces admin-configured daily message/token budgets. */
export async function assertWithinUsageLimits(user: AuthUser, settings: IAppSettings) {
  if (user.role === 'admin') return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { dailyMessagesPerUser, dailyTokensPerUser } = settings.limits;
  if (dailyMessagesPerUser > 0) {
    const count = await Message.countDocuments({ userId: user._id, role: 'user', createdAt: { $gte: since } });
    if (count >= dailyMessagesPerUser) {
      throw ApiError.tooMany(`Daily message limit reached (${dailyMessagesPerUser}). Try again tomorrow.`, 'USAGE_LIMIT');
    }
  }
  if (dailyTokensPerUser > 0) {
    const [agg] = await UsageLog.aggregate<{ total: number }>([
      { $match: { userId: user._id, createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$totalTokens' } } },
    ]);
    if ((agg?.total ?? 0) >= dailyTokensPerUser) {
      throw ApiError.tooMany('Daily token budget reached. Try again tomorrow.', 'USAGE_LIMIT');
    }
  }
}

/**
 * Like pickModel, but a model the user didn't actively choose just now – the one a chat was
 * started with, or their saved default – silently falls back to the workspace default when an
 * admin has removed or disabled it (e.g. after switching AI providers).
 */
export function pickModelForChat(settings: IAppSettings, user: AuthUser, requested: string | null | undefined, conversationModel?: string | null): ModelConfig {
  const inherited = !requested || requested === conversationModel || requested === user.preferences?.defaultModel;
  if (requested && (!inherited || resolveModel(settings, requested))) return pickModel(settings, user, requested);
  return (conversationModel && resolveModel(settings, conversationModel)) || pickModel(settings, user);
}

/** Picks the model for a request: explicit > conversation > user default > app default. */
export function pickModel(settings: IAppSettings, user: AuthUser, ...candidates: (string | null | undefined)[]): ModelConfig {
  const explicit = candidates.find(Boolean);
  if (explicit) {
    const model = resolveModel(settings, explicit);
    if (!model) throw new ApiError(400, `The model "${explicit}" is not available. Choose another model.`, 'MODEL_UNAVAILABLE');
    return model;
  }
  const model = resolveModel(settings, user.preferences?.defaultModel) ?? resolveModel(settings);
  if (!model) throw new ApiError(503, 'No AI models are currently enabled. Contact the administrator.', 'MODEL_UNAVAILABLE');
  return model;
}

function systemPrompt(settings: IAppSettings, user: AuthUser): string {
  const parts = [settings.systemPrompt.trim()];
  parts.push(`Current date: ${new Date().toISOString().slice(0, 10)}.`);
  const lang = user.preferences?.language;
  if (lang && lang !== 'en') {
    parts.push(`The user's preferred language is ${LANGUAGE_NAMES[lang] ?? lang}. Reply in that language unless the user writes in another one.`);
  }
  const p = user.preferences;
  const about = [
    p?.nickname?.trim() && `- Preferred name: ${p.nickname.trim()}`,
    p?.occupation?.trim() && `- Occupation: ${p.occupation.trim()}`,
    p?.aboutYou?.trim() && `- About them: ${p.aboutYou.trim()}`,
  ].filter(Boolean);
  if (about.length) parts.push(`What the user has shared about themselves (use it when relevant, don't repeat it back unprompted):\n${about.join('\n')}`);
  const custom = user.preferences?.customInstructions?.trim();
  if (custom) parts.push(`Additional instructions from the user about how to respond:\n${custom}`);
  return parts.filter(Boolean).join('\n\n');
}

async function toProviderMessage(m: IMessage, files: Map<string, IFile & { extractedText?: string | null }>, model: ModelConfig): Promise<ChatMessageInput> {
  if (m.role !== 'user' || !m.attachments.length) return { role: m.role, content: m.content };
  const textParts: string[] = [];
  const images: ContentPart[] = [];
  for (const id of m.attachments) {
    const f = files.get(id.toString());
    if (!f) continue;
    if (f.kind === 'image') {
      if (model.vision) {
        try {
          images.push({ type: 'image', dataUrl: await readAsDataUrl(f.storageName, f.mimeType) });
        } catch {
          textParts.push(`[Image "${f.originalName}" could not be loaded]`);
        }
      } else {
        textParts.push(`[The user attached an image "${f.originalName}", but the current model cannot view images.]`);
      }
    } else if (f.extractedText) {
      textParts.push(`<attached_file name="${f.originalName}">\n${f.extractedText}\n</attached_file>`);
    } else {
      textParts.push(`[Attached file "${f.originalName}" could not be read]`);
    }
  }
  const text = [...textParts, m.content].join('\n\n');
  if (!images.length) return { role: 'user', content: text };
  return { role: 'user', content: [{ type: 'text', text }, ...images] };
}

/**
 * Builds the prompt for the model: system prompt + as many recent messages as fit in the
 * configured message/token budget. `upTo` is the last message to include.
 */
export async function buildContext(
  conversationId: Types.ObjectId,
  upTo: IMessage,
  settings: IAppSettings,
  user: AuthUser,
  model: ModelConfig,
): Promise<ChatMessageInput[]> {
  const history = await Message.find({
    conversationId,
    $and: [
      { $or: [{ createdAt: { $lt: upTo.createdAt } }, { createdAt: upTo.createdAt, _id: { $lte: upTo._id } }] },
      { $or: [{ role: 'user' }, { role: 'assistant', status: { $in: ['complete', 'stopped'] }, content: { $ne: '' } }] },
    ],
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(settings.maxContextMessages)
    .lean<IMessage[]>();
  history.reverse();

  const fileIds = [...new Set(history.flatMap((m) => m.attachments.map(String)))];
  const files = fileIds.length
    ? new Map(
        (await FileModel.find({ _id: { $in: fileIds }, userId: user._id }).select('+extractedText').lean<IFile[]>()).map((f) => [f._id.toString(), f]),
      )
    : new Map<string, IFile>();

  const converted = await Promise.all(history.map((m) => toProviderMessage(m, files, model)));
  const system: ChatMessageInput = { role: 'system', content: systemPrompt(settings, user) };

  // Trim oldest messages until the estimated size fits; always keep the latest message.
  const size = (m: ChatMessageInput) =>
    estimateTokens(typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('')) +
    (typeof m.content === 'string' ? 0 : m.content.filter((p) => p.type === 'image').length * 800);
  let budget = settings.maxContextTokens - size(system);
  const kept: ChatMessageInput[] = [];
  for (let i = converted.length - 1; i >= 0; i--) {
    const cost = size(converted[i]!);
    if (kept.length > 0 && cost > budget) break;
    kept.unshift(converted[i]!);
    budget -= cost;
  }
  // Providers expect the first non-system message to be from the user.
  while (kept.length > 1 && kept[0]!.role !== 'user') kept.shift();
  return [system, ...kept];
}

export interface GenerationEvents {
  onDelta(text: string): void;
  onTitle?(title: string): void;
}

export interface GenerationResult {
  message: IMessage;
  stopped: boolean;
  error: AIProviderError | null;
}

/**
 * Streams an assistant reply into `assistant` (already persisted with status "streaming").
 * Always persists the final state – complete, stopped (partial content kept) or error – so
 * nothing already saved is lost when the connection drops or the provider fails.
 */
export async function generateReply(params: {
  user: AuthUser;
  conversation: IConversation;
  userMessage: IMessage;
  assistant: IMessage;
  model: ModelConfig;
  settings: IAppSettings;
  signal: AbortSignal;
  events: GenerationEvents;
}): Promise<GenerationResult> {
  const { user, conversation, userMessage, assistant, model, settings, signal, events } = params;
  const started = Date.now();
  let content = '';
  let usage: Usage | null = null;
  let error: AIProviderError | null = null;
  let stopped = false;

  try {
    const provider = getProvider(model.provider);
    const messages = await buildContext(conversation._id, userMessage, settings, user, model);
    const temperature = user.preferences?.temperature ?? settings.temperature;
    const maxTokens = Math.min(settings.maxTokens, model.maxOutputTokens || settings.maxTokens);
    for await (const chunk of provider.stream({ model: model.id, messages, temperature, maxTokens, signal })) {
      if (signal.aborted) break;
      if (chunk.type === 'delta') {
        content += chunk.text;
        events.onDelta(chunk.text);
      } else usage = chunk.usage;
    }
    if (signal.aborted) stopped = true;
  } catch (err) {
    const normalised = err instanceof AIProviderError ? err : new AIProviderError('Unexpected AI error', 'AI_UNAVAILABLE', 502);
    if (normalised.code === 'ABORTED' || signal.aborted) stopped = true;
    else {
      error = normalised;
      logger.warn(`AI generation failed (${normalised.code}): ${normalised.message}`);
    }
  }

  const promptEstimate = usage?.promptTokens ?? 0;
  const tokenUsage: TokenUsage = usage ?? {
    promptTokens: promptEstimate,
    completionTokens: estimateTokens(content),
    totalTokens: promptEstimate + estimateTokens(content),
  };
  const status = error ? 'error' : stopped ? 'stopped' : 'complete';

  const saved = await Message.findByIdAndUpdate(
    assistant._id,
    { content, status, error: error?.message ?? null, tokenUsage, model: model.id },
    { returnDocument: 'after' },
  ).lean<IMessage>();

  await UsageLog.create({
    userId: user._id,
    conversationId: conversation._id,
    messageId: assistant._id,
    provider: model.provider,
    model: model.id,
    type: 'chat',
    status: error ? 'error' : stopped ? 'stopped' : 'success',
    promptTokens: tokenUsage.promptTokens,
    completionTokens: tokenUsage.completionTokens,
    totalTokens: tokenUsage.totalTokens,
    latencyMs: Date.now() - started,
    error: error?.code ?? null,
  });

  await recountConversation(conversation._id);
  await Conversation.updateOne({ _id: conversation._id }, { lastMessageAt: new Date(), model: model.id });

  // Generate a better title after the first successful exchange.
  if (!error && !stopped && content && events.onTitle && settings.aiTitleGeneration && user.preferences?.autoTitle !== false) {
    const isFirstExchange = (await Message.countDocuments({ conversationId: conversation._id, role: 'user' })) === 1;
    if (isFirstExchange) {
      const title = await generateTitle(userMessage.content, content, model, user, conversation._id);
      if (title) {
        await Conversation.updateOne({ _id: conversation._id }, { title });
        events.onTitle(title);
      }
    }
  }

  return { message: saved ?? assistant, stopped, error };
}

async function generateTitle(question: string, answer: string, model: ModelConfig, user: AuthUser, conversationId: Types.ObjectId) {
  const started = Date.now();
  try {
    const provider = getProvider(model.provider);
    const { text, usage } = await provider.complete({
      model: model.id,
      temperature: 0.3,
      maxTokens: 24,
      timeoutMs: 15000,
      messages: [
        {
          role: 'system',
          content: 'Write a concise title (max 6 words) for this conversation. Reply with the title only, no quotes or punctuation at the end.',
        },
        { role: 'user', content: `User: ${question.slice(0, 1500)}\n\nAssistant: ${answer.slice(0, 1500)}` },
      ],
    });
    if (usage) {
      await UsageLog.create({
        userId: user._id,
        conversationId,
        provider: model.provider,
        model: model.id,
        type: 'title',
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        latencyMs: Date.now() - started,
      });
    }
    const cleaned = text.replace(/^["'\s]+|["'.\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 80);
    return cleaned || null;
  } catch (err) {
    logger.debug('Title generation failed', err);
    return null;
  }
}

/** Creates a conversation for a first message, titled from that message. */
export async function createConversationFor(user: AuthUser, firstMessage: string, model: string) {
  return Conversation.create({ userId: user._id, title: titleFromMessage(firstMessage), model });
}

/** Attaches uploaded files to a conversation after verifying the user owns all of them. */
export async function claimAttachments(ids: string[], user: AuthUser, conversationId: Types.ObjectId) {
  if (!ids.length) return [] as Types.ObjectId[];
  const unique = [...new Set(ids)];
  const files = await FileModel.find({ _id: { $in: unique }, userId: user._id }).select('_id conversationId').lean();
  if (files.length !== unique.length) throw ApiError.badRequest('One or more attachments were not found');
  if (files.some((f) => f.conversationId && !f.conversationId.equals(conversationId))) {
    throw ApiError.badRequest('An attachment belongs to a different conversation');
  }
  await FileModel.updateMany({ _id: { $in: unique } }, { conversationId });
  return unique.map((id) => new Types.ObjectId(id));
}

export { getSettings };
