import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

// Operator injection ($gt, $ne, ...) is prevented by Zod validation on every route plus the
// mongoSanitize middleware, so application queries can use operators freely.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 20 });
  logger.info(`MongoDB connected (${conn.connection.host}/${conn.connection.name})`);
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
