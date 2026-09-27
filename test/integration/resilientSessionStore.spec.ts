import MongoStore from 'connect-mongo';
import type { SessionData } from 'express-session';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';

import { ResilientSessionStore } from '@/db/resilientSessionStore';

const dbName = 'resilient-session-store';

const callStore = <T>(operation: (callback: (error: unknown, value?: T) => void) => void): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    operation((error, value) => (error ? reject(error) : resolve(value)));
  });

describe('ResilientSessionStore with MongoDB', () => {
  afterEach(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  it('reloads a persisted session after the shared client disconnects', async () => {
    const createStore = async () => {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI as string, { dbName });
      }
      return MongoStore.create({
        client: mongoose.connection.getClient() as unknown as Parameters<typeof MongoStore.create>[0]['client'],
        dbName,
        collectionName: 'sessions',
        stringify: false,
        ttl: 60 * 60,
      });
    };
    const store = new ResilientSessionStore(createStore);
    const session = {
      cookie: {
        originalMaxAge: 60_000,
        expires: new Date(Date.now() + 60_000),
        secure: true,
        httpOnly: true,
        path: '/',
      },
      user: { username: 'jamie' },
    } as unknown as SessionData;

    await callStore<void>((callback) => store.set('social-session', session, callback));
    await mongoose.disconnect();

    const restored = await callStore<SessionData | null>((callback) => store.get('social-session', callback));

    expect(restored?.user).toEqual({ username: 'jamie' });
  });
});
