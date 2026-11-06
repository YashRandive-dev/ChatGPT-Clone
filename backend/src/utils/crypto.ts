import crypto from 'node:crypto';

/** Cryptographically secure random token, URL-safe. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** One-way SHA-256 hash used to store tokens at rest. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
