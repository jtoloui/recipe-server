import dotenv from 'dotenv';
import mongoose from 'mongoose';

import logger from '../logger/winston';
import { ConfigType } from '../config/config';
import MongoDBStore from 'connect-mongodb-session';
import session from 'express-session';

dotenv.config();

export const connectDB = async (
  cfg: ConfigType,
): Promise<MongoDBStore.MongoDBStore> => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const winstonLogger = logger(logLevel, 'database');
  try {
    // winston logger
    await mongoose.connect(cfg.mongoUri, {
      autoCreate: true,
      dbName: 'recipe',
      appName: 'recipe-api',
    });
    winstonLogger.info('MongoDB connected successfully');

    const MongoDBStores = MongoDBStore(session);

    const store = new MongoDBStores({
      uri: cfg.mongoUri,
      databaseName: process.env.MONGODB_SESSION_DB || 'recipe-app',
      collection: process.env.MONGODB_SESSION_COLLECTION || 'session',
      expires: 1000 * 60 * 60 * 24 * 7, // 1 week
    });

    store.on('error', (error) => {
      winstonLogger.error(error);
    });

    store.on('connected', () => {
      winstonLogger.info('MongoDB session store connected');
    });
    return store;
  } catch (error) {
    winstonLogger.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

class DBConnection {
  private cfg: ConfigType;
  private store: MongoDBStore.MongoDBStore | null = null;
  private winstonLogger = logger(process.env.LOG_LEVEL || 'info', 'database');

  constructor(cfg: ConfigType) {
    this.cfg = cfg;
  }

  async connectDB(): Promise<this> {
    try {
      await mongoose.connect(this.cfg.mongoUri, {
        autoCreate: true,
        dbName: 'recipe',
        appName: 'recipe-api',
      });
      this.winstonLogger.info('MongoDB connected successfully');
      return this; // Enable method chaining
    } catch (error) {
      this.winstonLogger.error('Error connecting to MongoDB:', error);
      process.exit(1);
    }
  }

  async connectSessionStore(): Promise<this> {
    if (!this.store) {
      const MongoDBStores = MongoDBStore(session);

      this.store = new MongoDBStores({
        uri: this.cfg.mongoUri,
        databaseName: process.env.MONGODB_SESSION_DB || 'recipe-app',
        collection: process.env.MONGODB_SESSION_COLLECTION || 'session',
        expires: 1000 * 60 * 60 * 24 * 7, // 1 week
      });

      this.store.on('error', (error) => {
        this.winstonLogger.error(error);
        process.exit(1);
      });

      this.store.on('connected', () => {
        this.winstonLogger.info('MongoDB session store connected');
      });
    }
    return this; // Enable method chaining
  }

  getSessionStore(): MongoDBStore.MongoDBStore {
    if (!this.store) {
      throw new Error(
        'Session store is not initialized. Call connectSessionStore() first.',
      );
    }
    return this.store;
  }
}

export { DBConnection };
