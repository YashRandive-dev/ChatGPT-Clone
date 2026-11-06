import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** Validates and replaces req.body / req.query / req.params with parsed (typed, stripped) data. */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
    if (schemas.query) {
      const parsed = schemas.query.parse(req.query);
      // Express 5 exposes req.query as a getter; shadow it with the parsed value.
      Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true, enumerable: true });
    }
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  };
}
