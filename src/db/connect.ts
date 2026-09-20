import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import logger from '../logger/winston';
import { ConfigType } from '../types/config/config';

dotenv.config();

class DBConnection {
  private cfg: ConfigType;
  private store: MongoStore | null = null;
  private winstonLogger = logger(process.env.LOG_LEVEL || 'info', 'database');

  constructor(cfg: ConfigType) {
    this.cfg = cfg;
  }

  async connectDB(): Promise<this> {
    // On Lambda the container is reused across invocations, so reuse an existing
    // live connection instead of dialing again (readyState 1 = connected,
    // 2 = connecting). Re-dialing per request, or exiting the process on a
    // transient cold-start timeout, caused Runtime.ExitError -> 502 on the first
    // hit to a cold container.
    const state = mongoose.connection.readyState;
    if (state === 1 || state === 2) {
      return this;
    }
    try {
      await mongoose.connect(this.cfg.mongoUri, {
        autoCreate: true,
        dbName: this.cfg.mongoDbName,
        appName: 'recipe-api',
        // Serverless-friendly: wait for a node to be selected on a cold start
        // rather than failing fast, and keep the pool small.
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        maxPoolSize: 5,
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
