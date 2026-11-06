import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { mongoSanitize } from './middleware/sanitize';
import { originCheck } from './middleware/originCheck';
import { logger } from './utils/logger';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / server-to-server requests (no Origin) and configured frontends.
        if (!origin || env.frontendOrigins.includes(origin.replace(/\/$/, ''))) cb(null, true);
        else cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(mongoSanitize);

  if (!env.isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  app.get('/', (_req, res) => {
    res.json({ name: 'Kairo API', status: 'ok', docs: '/api/health' });
  });
  app.use('/api', globalLimiter, originCheck, routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
