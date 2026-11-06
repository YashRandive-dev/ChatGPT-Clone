import { z } from 'zod';
import { email, name, password } from './common';
import { SUPPORTED_LANGUAGES } from '../models/User';

export const updatePreferencesSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    language: z.enum(SUPPORTED_LANGUAGES),
    defaultModel: z.string().trim().max(100).nullable(),
    sendOnEnter: z.boolean(),
    showTimestamps: z.boolean(),
    autoTitle: z.boolean(),
    customInstructions: z.string().max(2000),
    temperature: z.number().min(0).max(2).nullable(),
    fontSize: z.enum(['small', 'medium', 'large']),
    chatWidth: z.enum(['narrow', 'default', 'wide']),
    codeWrap: z.boolean(),
    showTokenUsage: z.boolean(),
    autoScroll: z.boolean(),
    reduceMotion: z.boolean(),
    suggestedPrompts: z.boolean(),
    nickname: z.string().trim().max(50),
    occupation: z.string().trim().max(100),
    aboutYou: z.string().max(1500),
    notifyNewSignIn: z.boolean(),
    notifyPasswordChange: z.boolean(),
  })
  .partial();

export const updateProfileSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    avatar: z
      .string()
      .trim()
      .url('Avatar must be a URL')
      .max(500)
      .refine((v) => v.startsWith('https://'), 'Avatar URL must use https')
      .nullable()
      .optional(),
    currentPassword: z.string().max(128).optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.avatar !== undefined, { message: 'Nothing to update' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: password,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required').max(128),
});

export const twoFactorSchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1, 'Password is required').max(128),
});
