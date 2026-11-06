import { z } from 'zod';
import { objectId } from './common';

export const MAX_MESSAGE_CHARS = 32_000;

export const listConversationsQuery = z.object({
  search: z.string().trim().max(200).optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  archived: z.enum(['true', 'false']).optional(),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().max(100).optional(),
});

export const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
    model: z.string().trim().max(100).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const getConversationQuery = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const sendMessageSchema = z.object({
  conversationId: objectId.optional(),
  content: z.string().trim().min(1, 'Message cannot be empty').max(MAX_MESSAGE_CHARS, 'Message is too long'),
  model: z.string().trim().max(100).optional(),
  attachments: z.array(objectId).max(5, 'At most 5 attachments per message').default([]),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(MAX_MESSAGE_CHARS),
});

export const regenerateSchema = z.object({ model: z.string().trim().max(100).optional() });

export const feedbackSchema = z.object({
  rating: z.enum(['like', 'dislike']).nullable(),
  comment: z.string().trim().max(2000).optional(),
});
