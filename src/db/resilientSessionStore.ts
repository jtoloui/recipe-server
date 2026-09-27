import type MongoStore from 'connect-mongo';
import { SessionData, Store } from 'express-session';

type SessionStoreFactory = () => Promise<MongoStore>;
type StoreCallback<T> = (error: unknown, value?: T) => void;

/**
 * Lazily creates connect-mongo against a live shared Mongo client.
 *
 * connect-mongo permanently caches its initial collection promise. A transient
 * cold-start connection failure therefore poisons that store for the lifetime
 * of a warm Lambda. This delegate discards a failed store and retries once per
 * operation; a later request always gets another chance to establish a store.
 */
export class ResilientSessionStore extends Store {
  private store: MongoStore | null = null;
  private storePromise: Promise<MongoStore> | null = null;
  private readonly createStore: SessionStoreFactory;

  constructor(createStore: SessionStoreFactory) {
    super();
    this.createStore = createStore;
  }

  private getStore(): Promise<MongoStore> {
    if (this.store) return Promise.resolve(this.store);
    if (this.storePromise) return this.storePromise;

    this.storePromise = this.createStore()
      .then((store) => {
        this.store = store;
        return store;
      })
      .finally(() => {
        this.storePromise = null;
      });

    return this.storePromise;
  }

  private invalidate(store?: MongoStore): void {
    if (!store || this.store === store) this.store = null;
  }

  private execute<T>(
    operation: (store: MongoStore, callback: StoreCallback<T>) => void,
    callback: StoreCallback<T>,
    retries = 1,
  ): void {
    void this.getStore()
      .then((store) => {
        operation(store, (error, value) => {
          if (error && retries > 0) {
            this.invalidate(store);
            this.execute(operation, callback, retries - 1);
            return;
          }
          callback(error, value);
        });
      })
      .catch((error: unknown) => {
        this.invalidate();
        if (retries > 0) {
          this.execute(operation, callback, retries - 1);
          return;
        }
        callback(error);
      });
  }

  get(sid: string, callback: (error: unknown, session?: SessionData | null) => void): void {
    this.execute<SessionData | null>(
      (store, done) => store.get(sid, done),
      callback,
    );
  }

  set(sid: string, session: SessionData, callback: (error?: unknown) => void = () => undefined): void {
    this.execute<void>(
      (store, done) => store.set(sid, session, (error) => done(error)),
      (error) => callback(error || undefined),
    );
  }

  destroy(sid: string, callback: (error?: unknown) => void = () => undefined): void {
    this.execute<void>(
      (store, done) => store.destroy(sid, (error) => done(error)),
      (error) => callback(error || undefined),
    );
  }

  touch(sid: string, session: SessionData, callback: (error?: unknown) => void = () => undefined): void {
    this.execute<void>(
      (store, done) => store.touch(sid, session, (error) => done(error)),
      (error) => callback(error || undefined),
    );
  }
}
