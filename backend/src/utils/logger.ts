/* Minimal structured logger. Silent in tests unless LOG_LEVEL is set. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const configured = (process.env.LOG_LEVEL as Level | undefined) ??
  (process.env.NODE_ENV === 'test' ? undefined : process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function log(level: Level, message: string, meta?: unknown) {
  if (!configured || order[level] < order[configured]) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

export const logger = {
  debug: (m: string, meta?: unknown) => log('debug', m, meta),
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
};
