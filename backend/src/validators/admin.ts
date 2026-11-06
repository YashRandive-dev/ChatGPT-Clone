import { z } from 'zod';

export const listUsersQuery = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'blocked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateUserSchema = z
  .object({
    blocked: z.boolean().optional(),
    role: z.enum(['user', 'admin']).optional(),
    emailVerified: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const modelConfig = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[\w.:\-/]+$/, 'Model id has invalid characters'),
  label: z.string().trim().min(1).max(100),
  provider: z.string().trim().min(1).max(40).default('openai'),
  description: z.string().trim().max(300).default(''),
  enabled: z.boolean().default(true),
  vision: z.boolean().default(false),
  maxOutputTokens: z.number().int().min(64).max(200000).default(4096),
});

export const updateAppSettingsSchema = z
  .object({
    appName: z.string().trim().min(1).max(60),
    models: z
      .array(modelConfig)
      .min(1, 'At least one model is required')
      .max(50)
      .refine((arr) => new Set(arr.map((m) => m.id)).size === arr.length, 'Model ids must be unique'),
    defaultModel: z.string().trim().min(1).max(100),
    systemPrompt: z.string().max(8000),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().min(64).max(32000),
    maxContextMessages: z.number().int().min(2).max(200),
    maxContextTokens: z.number().int().min(500).max(200000),
    limits: z
      .object({
        dailyMessagesPerUser: z.number().int().min(0).max(1_000_000),
        dailyTokensPerUser: z.number().int().min(0).max(1_000_000_000),
        aiRequestsPerMinute: z.number().int().min(1).max(10_000),
      })
      .partial(),
    registrationEnabled: z.boolean(),
    allowAdminConversationAccess: z.boolean(),
    aiTitleGeneration: z.boolean(),
  })
  .partial();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.enum(['like', 'dislike']).optional(),
  userId: z.string().optional(),
  search: z.string().trim().max(200).optional(),
});

export const usageQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
