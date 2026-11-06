import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { getSettings } from '../services/settingsService';

const skipInTests = () => env.isTest && process.env.TEST_RATE_LIMIT !== 'true';

const message = (msg: string) => ({ error: { code: 'RATE_LIMITED', message: msg } });

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: message('Too many requests. Please slow down.'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: message('Too many authentication attempts. Try again in a few minutes.'),
});

/** Per-user limiter for AI calls; the limit is configurable from the admin dashboard. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: async () => (await getSettings()).limits.aiRequestsPerMinute || 1000,
  keyGenerator: (req: Request) => (req.user ? `u:${req.user._id.toString()}` : ipKeyGenerator(req.ip ?? '')),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: message('You are sending messages too quickly. Wait a moment and try again.'),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: (req: Request) => (req.user ? `u:${req.user._id.toString()}` : ipKeyGenerator(req.ip ?? '')),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipInTests,
  message: message('Upload limit reached. Try again later.'),
});
