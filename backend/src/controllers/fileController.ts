import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { FileModel, serializeFile } from '../models/File';
import { Message } from '../models/Message';
import { currentUser } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { detectKind, extractText, removeStored, sanitizeFilename, storagePath, storeBuffer } from '../services/fileService';

/** POST /api/files/upload (multipart, field "file") */
export async function uploadFile(req: Request, res: Response) {
  const user = currentUser(req);
  const file = req.file;
  if (!file) throw ApiError.badRequest('No file provided (use multipart field "file")');
  if (file.size === 0) throw ApiError.badRequest('File is empty');

  const ext = path.extname(file.originalname).toLowerCase();
  const detected = detectKind(file.buffer, ext);
  if (!detected) throw ApiError.badRequest('File content does not match its type or the type is not supported');

  const extractedText = await extractText(file.buffer, detected.kind);
  if (detected.kind !== 'image' && !extractedText) {
    throw ApiError.badRequest('Could not read any text from this document. It may be scanned, encrypted or corrupt.');
  }
  const storageName = await storeBuffer(file.buffer, ext);
  const doc = await FileModel.create({
    userId: user._id,
    originalName: sanitizeFilename(file.originalname),
    storageName,
    mimeType: detected.mime,
    kind: detected.kind,
    size: file.size,
    extractedText,
  });
  res.status(201).json({
    file: { ...serializeFile(doc), hasText: Boolean(extractedText), preview: extractedText ? extractedText.slice(0, 400) : null },
  });
}

/** GET /api/files/:id — streams the file to its owner. ?download=1 forces a download. */
export async function getFile(req: Request, res: Response) {
  const user = currentUser(req);
  const file = await FileModel.findOne({ _id: req.params.id, userId: user._id }).lean();
  if (!file) throw ApiError.notFound('File not found');
  const full = storagePath(file.storageName);
  if (!fs.existsSync(full)) throw ApiError.notFound('File data is missing');

  const inline = file.kind === 'image' || file.kind === 'pdf';
  const disposition = req.query.download === '1' || !inline ? 'attachment' : 'inline';
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  fs.createReadStream(full).pipe(res);
}

/** DELETE /api/files/:id — removes an attachment (also from any message referencing it). */
export async function deleteFile(req: Request, res: Response) {
  const user = currentUser(req);
  const file = await FileModel.findOne({ _id: req.params.id, userId: user._id });
  if (!file) throw ApiError.notFound('File not found');
  await removeStored(file.storageName);
  await Message.updateMany({ userId: user._id, attachments: file._id }, { $pull: { attachments: file._id } });
  await file.deleteOne();
  res.json({ ok: true });
}
