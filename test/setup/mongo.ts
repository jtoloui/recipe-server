import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// A single in-process MongoDB for the whole test run (no Docker needed).
// Proven to work with this app during recon.
let mongod: MongoMemoryServer | undefined;

export async function startMemoryMongo(): Promise<string> {
  mongod = await MongoMemoryServer.create();
  return mongod.getUri();
}

export async function stopMemoryMongo(): Promise<void> {
  await mongoose.disconnect().catch(() => undefined);
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
}

/** Drop all collections between tests so cases don't leak state into each other. */
export async function clearCollections(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
