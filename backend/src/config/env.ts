import dotenv from 'dotenv';

// Tests must not depend on a developer's personal .env (database, AI provider, models…).
if (process.env.NODE_ENV !== 'test') dotenv.config({ quiet: true });
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().optional(),

  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/kairo'),

  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  COOKIE_SECRET: z.string().optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  ADMIN_EMAILS: z.string().default(''),
  REQUIRE_EMAIL_VERIFICATION: bool(false),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  AI_MODELS: z.string().default('gpt-4o-mini|GPT-4o mini|true'),
  AI_DEFAULT_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Kairo <no-reply@kairo.local>'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
  process.exit(1);
}
const raw = parsed.data;

const isProd = raw.NODE_ENV === 'production';
const isTest = raw.NODE_ENV === 'test';

function secret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET' | 'COOKIE_SECRET'): string {
  const value = raw[name];
  if (value && value.length >= 32) return value;
  if (isProd) {
    console.error(`${name} must be set to a random string of at least 32 characters in production.`);
    process.exit(1);
  }
  if (!isTest) console.warn(`[env] ${name} is missing or short; using an insecure development fallback.`);
  return `dev-insecure-${name.toLowerCase()}-fallback-change-me-please`;
}

/**
 * How many reverse proxies sit in front of the app (Express "trust proxy" hops), so client
 * IPs (used for rate limiting) are read correctly from X-Forwarded-For.
 *  - unset: 1 on Render (its load balancer), otherwise 0 (local development)
 *  - "true" = 1, "false" = 0, or a number. Use 2 when a Vercel rewrite forwards /api to Render.
 */
export function trustProxyHops(value: string | undefined): number {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') return process.env.RENDER ? 1 : 0;
  if (v === 'true' || v === 'yes') return 1;
  if (v === 'false' || v === 'no') return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 1;
}

export const env = {
  ...raw,
  TRUST_PROXY: trustProxyHops(raw.TRUST_PROXY),
  isProd,
  isTest,
  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
  COOKIE_SECRET: secret('COOKIE_SECRET'),
  frontendOrigins: raw.FRONTEND_URL.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  adminEmails: raw.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  maxUploadBytes: Math.round(raw.MAX_UPLOAD_MB * 1024 * 1024),
};

export const primaryFrontendUrl = env.frontendOrigins[0] ?? 'http://localhost:3000';
