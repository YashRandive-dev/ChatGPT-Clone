import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route ${req.method} ${req.path} not found`, 'NOT_FOUND'));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details: unknown;
  // ApiError details are intentional and user-facing (e.g. attemptsLeft, retryAfter).
  let publicDetails = false;

  if (err instanceof ApiError) {
    ({ status, code, message } = err);
    details = err.details;
    publicDetails = true;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = err.issues[0]?.message ?? 'Invalid request';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'INVALID_ID';
    message = 'Invalid identifier';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = Object.values(err.errors)[0]?.message ?? 'Invalid data';
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code;
    message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.MAX_UPLOAD_MB} MB)` : err.message;
  } else if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'A record with these details already exists';
  } else if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON body';
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl} failed`, err);

  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: { code, message, ...(details && (publicDetails || !env.isProd) ? { details } : {}) } });
}
