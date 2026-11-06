import { env } from './config/env';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { getSettings, syncModelsFromEnv } from './services/settingsService';
import { ensureUploadDir } from './services/fileService';
import { Message } from './models/Message';
import { EmailVerificationToken } from './models/EmailVerificationToken';
import { PasswordResetToken } from './models/PasswordResetToken';
import { logger } from './utils/logger';

async function main() {
  await connectDatabase();
  await ensureUploadDir();
  // Drop indexes left over from older schema versions (e.g. link-based tokenHash) and build the current ones.
  await Promise.all([EmailVerificationToken.syncIndexes(), PasswordResetToken.syncIndexes()]);
  const sync = await syncModelsFromEnv();
  if (sync.changed) logger.info(`AI_MODELS changed in .env – model list updated to: ${sync.models.join(', ')}`);
  const settings = await getSettings(true);
  logger.info(`Models: ${settings.models.map((m) => `${m.id}${m.enabled ? '' : ' (disabled)'}`).join(', ')}`);
  if (!env.OPENAI_API_KEY) logger.warn('OPENAI_API_KEY is not set – chat requests will fail until it is configured.');

  // Replies left "streaming" by a crash/restart become "stopped" so users can regenerate them.
  const stale = await Message.updateMany({ status: 'streaming', updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }, { status: 'stopped' });
  if (stale.modifiedCount) logger.info(`Recovered ${stale.modifiedCount} interrupted responses`);

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`Kairo API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`));
  // Long-lived streaming responses must not be cut by the default timeouts.
  server.requestTimeout = 0;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 61_000;

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  const text = String((err as Error)?.message ?? err);
  if (/ECONNREFUSED|ENOTFOUND|querySrv|Server selection timed out|ReplicaSetNoPrimary|IP.*(whitelist|access list)|bad auth|Authentication failed/i.test(text)) {
    logger.error(
      'Could not connect to MongoDB. Check MONGODB_URI. If you use MongoDB Atlas from a cloud host (e.g. Render), ' +
        'allow it in Atlas → Network Access → Add IP Address → "Allow access from anywhere" (0.0.0.0/0), ' +
        'and check the database username/password in the connection string.',
    );
  }
  process.exit(1);
});
