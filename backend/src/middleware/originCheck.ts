import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: browsers always attach an Origin header
 * to cross-origin (and same-origin POST) requests, so reject state-changing requests whose
 * Origin is not an allowed frontend origin.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !env.frontendOrigins.includes(origin.replace(/\/$/, ''))) {
    throw ApiError.forbidden('Request origin not allowed', 'BAD_ORIGIN');
  }
  next();
}
