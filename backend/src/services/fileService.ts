import fs from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from '../utils/crypto';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import type { FileKind } from '../models/File';

export const MAX_EXTRACTED_CHARS = 60_000;

export const uploadRoot = () => path.resolve(process.cwd(), env.UPLOAD_DIR);

export async function ensureUploadDir() {
  await fs.mkdir(uploadRoot(), { recursive: true });
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

/**
 * Determines the real file type from its content ("magic bytes") rather than trusting the
 * client-provided name or MIME type. Returns null when the content does not match.
 */
export function detectKind(buf: Buffer, ext: string): { kind: FileKind; mime: string } | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return ext === '.pdf' ? { kind: 'pdf', mime: 'application/pdf' } : null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return ext === '.png' ? { kind: 'image', mime: 'image/png' } : null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return ['.jpg', '.jpeg'].includes(ext) ? { kind: 'image', mime: 'image/jpeg' } : null;
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return ext === '.gif' ? { kind: 'image', mime: 'image/gif' } : null;
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return ext === '.webp' ? { kind: 'image', mime: 'image/webp' } : null;
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // DOCX is a ZIP container that includes word/document.xml.
    const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('latin1');
    if (ext === '.docx' && (head.includes('word/') || head.includes('[Content_Types].xml'))) {
      return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }
    return null;
  }
  if (['.txt', '.md', '.csv', '.json'].includes(ext)) {
    // Plain text: no NUL bytes and valid UTF-8.
    if (buf.includes(0)) return null;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (decoded.includes('�')) return null;
    const mime = ext === '.md' ? 'text/markdown' : ext === '.csv' ? 'text/csv' : ext === '.json' ? 'application/json' : 'text/plain';
    return { kind: 'txt', mime };
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name).normalize('NFKC');
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return (cleaned || 'file').slice(0, 200);
}

export async function extractText(buf: Buffer, kind: FileKind): Promise<string | null> {
  try {
    let text = '';
    if (kind === 'txt') text = buf.toString('utf8');
    else if (kind === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else if (kind === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else return null;
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text.length > MAX_EXTRACTED_CHARS ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n…[truncated]` : text;
  } catch (err) {
    logger.warn(`Text extraction failed for ${kind}`, err);
    return null;
  }
}

export async function storeBuffer(buf: Buffer, ext: string): Promise<string> {
  await ensureUploadDir();
  const storageName = `${randomToken(24)}${ext}`;
  await fs.writeFile(path.join(uploadRoot(), storageName), buf, { flag: 'wx', mode: 0o600 });
  return storageName;
}

/** Resolves a stored file path and guarantees it stays inside the upload directory. */
export function storagePath(storageName: string): string {
  const root = uploadRoot();
  const full = path.resolve(root, storageName);
  if (!full.startsWith(root + path.sep)) throw ApiError.badRequest('Invalid file path');
  return full;
}

export async function removeStored(storageName: string) {
  try {
    await fs.unlink(storagePath(storageName));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.warn('Failed to delete stored file', err);
  }
}

export async function readAsDataUrl(storageName: string, mime: string): Promise<string> {
  const buf = await fs.readFile(storagePath(storageName));
  return `data:${mime};base64,${buf.toString('base64')}`;
}
