import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/plain', 'text/x-markdown'],
  '.csv': ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  '.json': ['application/json', 'text/plain'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
};

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ALLOWED_EXTENSIONS[ext];
    if (!allowed || !allowed.includes(file.mimetype)) {
      cb(ApiError.badRequest('Unsupported file type. Allowed: PDF, TXT, MD, CSV, JSON, DOCX, PNG, JPG, GIF, WEBP.'));
      return;
    }
    cb(null, true);
  },
}).single('file');
