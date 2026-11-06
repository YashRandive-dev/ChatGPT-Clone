import type { NextFunction, Request, Response } from 'express';

/**
 * Removes keys that could be interpreted as MongoDB operators ("$gt") or dotted paths
 * ("a.b") from user-supplied objects. Mutates in place (Express 5 query objects are getters).
 */
function clean(value: unknown, depth = 0): void {
  if (depth > 20 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v) => clean(v, depth + 1));
    return;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete (value as Record<string, unknown>)[key];
    } else {
      clean((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}

export function mongoSanitize(req: Request, _res: Response, next: NextFunction) {
  clean(req.body);
  clean(req.params);
  clean(req.query);
  next();
}
