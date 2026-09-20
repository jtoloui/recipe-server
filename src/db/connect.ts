import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import logger from '../logger/winston';
import { ConfigType } from '../types/config/config';

dotenv.config();

// Fail fast instead of buffering a query for ~10s when the connection is dead.
// Without this, a query on a stale/dead socket buffers silently then times out,
// masking the real problem and hanging every request. With it, the query errors
// immediately so our ping/reconnect logic runs. (Mongoose-on-Lambda guidance.)
mongoose.set('bufferCommands', false);

class DBConnection {
  private cfg: ConfigType;
  private store: MongoStore | null = null;
  private winstonLogger = logger(process.env.LOG_LEVEL || 'info', 'database');

  constructor(cfg: ConfigType) {
    this.cfg = cfg;
  }

  /**
   * Establish (or reuse) the Mongo connection.
   *
   * On Lambda the container is frozen between invocations; the underlying
   * socket can die during the freeze while mongoose.connection.readyState still
   * reads 1 ("connected"). Trusting readyState alone means a warm invocation
   * reuses a DEAD connection and every query fails with
   * `MongoServerSelectionError: Server selection timed out`. So instead of
   * trusting readyState, we actively PING; if the ping fails the socket is dead
   * and we drop the connection and reconnect.
   */
  async connectDB(): Promise<this> {
    const state = mongoose.connection.readyState;
    if (state === 1) {
      // Believed-connected — verify the socket is actually alive before reuse.
      try {
        await mongoose.connection.db?.admin().command({ ping: 1 });
        return this;
      } catch (pingErr) {
        // Stale/dead socket from a frozen container — drop it and reconnect.
        this.winstonLogger.warn(
          'MongoDB connection failed liveness ping — reconnecting:',
          pingErr,
        );
        try {
          await mongoose.disconnect();
        } catch {
          /* ignore disconnect errors — we're rebuilding anyway */
        }
      }
    } else if (state === 2) {
      // A connect is already in flight (concurrent cold invocation) — wait for it.
      try {
        await mongoose.connection.asPromise();
        return this;
      } catch {
        /* fall through to a fresh connect */
      }
    }

    try {
      await mongoose.connect(this.cfg.mongoUri, {
        autoCreate: true,
        dbName: this.cfg.mongoDbName,
        appName: 'recipe-api',
        // Fail fast on Lambda rather than hanging 30s on a dead topology.
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 5,
        minPoolSize: 0,
        // Close idle pooled sockets so the driver reopens fresh ones instead of
        // reusing a socket that froze during the Lambda idle gap.
        maxIdleTimeMS: 60000,
      });
      this.winstonLogger.info('MongoDB connected successfully');
      return this;
    } catch (error) {
      // Do NOT process.exit on Lambda — that kills the container and returns a
      // 502. Throw so this invocation fails cleanly while the container (and a
      // future retry / warm connection) survives.
      this.winstonLogger.error('Error connecting to MongoDB:', error);
      throw error;
    }
  }

  async connectSessionStore(): Promise<this> {
    if (!this.store) {
      this.store = MongoStore.create({
        mongoUrl: this.cfg.mongoUri,
        dbName: this.cfg.sessionDBName,
        collectionName: this.cfg.sessionCollection,
        ttl: 1000 * 60 * 60 * 24 * 7, // 1 week
        stringify: false,
        // Match the connectDB pool/selection behaviour so the session store
        // also fails fast rather than hanging on a dead socket.
        mongoOptions: {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          maxPoolSize: 5,
          minPoolSize: 0,
          maxIdleTimeMS: 60000,
        },
      });
      this.store.all((error, sessions) => {
        if (error) {
          // Log but do not exit the process — a transient session-store read
          // error must not kill the Lambda container.
          this.winstonLogger.error(error);
          return;
        }
        if (sessions) {
          this.winstonLogger.info('MongoDB session store connected');
        }
      });
    }
    return this; // Enable method chaining
  }

  getSessionStore(): MongoStore {
    if (!this.store) {
      throw new Error('Session store is not initialized. Call connectSessionStore() first.');
    }
    return this.store;
  }
}

export { DBConnection };
