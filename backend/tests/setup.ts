import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { invalidateSettingsCache } from '../src/services/settingsService';
import { outbox } from '../src/services/emailService';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  // Uses a locally installed mongod when MONGOMS_SYSTEM_BINARY is set, otherwise downloads one.
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'kairo-test' });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  invalidateSettingsCache();
  outbox.length = 0;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
