import type MongoStore from 'connect-mongo';
import type { SessionData } from 'express-session';
import { describe, expect, it, vi } from 'vitest';

import { ResilientSessionStore } from '@/db/resilientSessionStore';

const sessionData = {
  cookie: { originalMaxAge: 1000 },
  user: { username: 'jamie' },
} as unknown as SessionData;

const storeWithGet = (get: MongoStore['get']) => ({ get }) as MongoStore;

describe('ResilientSessionStore', () => {
  it('retries when initial store creation rejects', async () => {
    const healthyStore = storeWithGet((_sid, callback) => callback(null, sessionData));
    const createStore = vi
      .fn<() => Promise<MongoStore>>()
      .mockRejectedValueOnce(new Error('server selection timeout'))
      .mockResolvedValueOnce(healthyStore);
    const store = new ResilientSessionStore(createStore);

    const result = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid', (error, session) => (error ? reject(error) : resolve(session)));
    });

    expect(result).toBe(sessionData);
    expect(createStore).toHaveBeenCalledTimes(2);
  });

  it('discards a failed delegate and retries the operation with a new store', async () => {
    const failedStore = storeWithGet((_sid, callback) => callback(new Error('stale socket')));
    const healthyStore = storeWithGet((_sid, callback) => callback(null, sessionData));
    const createStore = vi
      .fn<() => Promise<MongoStore>>()
      .mockResolvedValueOnce(failedStore)
      .mockResolvedValueOnce(healthyStore);
    const store = new ResilientSessionStore(createStore);

    const result = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid', (error, session) => (error ? reject(error) : resolve(session)));
    });

    expect(result).toBe(sessionData);
    expect(createStore).toHaveBeenCalledTimes(2);
  });

  it('returns the second failure once and retries again on the next request', async () => {
    const createStore = vi
      .fn<() => Promise<MongoStore>>()
      .mockRejectedValueOnce(new Error('first timeout'))
      .mockRejectedValueOnce(new Error('second timeout'))
      .mockResolvedValueOnce(storeWithGet((_sid, callback) => callback(null, sessionData)));
    const store = new ResilientSessionStore(createStore);

    const firstError = await new Promise<unknown>((resolve) => {
      store.get('sid', (error) => resolve(error));
    });
    const secondResult = await new Promise<SessionData | null | undefined>((resolve, reject) => {
      store.get('sid', (error, session) => (error ? reject(error) : resolve(session)));
    });

    expect(firstError).toEqual(new Error('second timeout'));
    expect(secondResult).toBe(sessionData);
    expect(createStore).toHaveBeenCalledTimes(3);
  });

  it('reuses a healthy delegate', async () => {
    const get = vi.fn<MongoStore['get']>((_sid, callback) => callback(null, sessionData));
    const createStore = vi.fn<() => Promise<MongoStore>>().mockResolvedValue(storeWithGet(get));
    const store = new ResilientSessionStore(createStore);

    await Promise.all([
      new Promise<void>((resolve, reject) => store.get('one', (error) => (error ? reject(error) : resolve()))),
      new Promise<void>((resolve, reject) => store.get('two', (error) => (error ? reject(error) : resolve()))),
    ]);

    expect(createStore).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
