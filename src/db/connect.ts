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
      this.store = MongoStore.create({
        mongoUrl: this.cfg.mongoUri,
        dbName: this.cfg.sessionDBName,
        collectionName: this.cfg.sessionCollection,
        ttl: 1000 * 60 * 60 * 24 * 7, // 1 week
        stringify: false,
      });
      this.store.all((error, sessions) => {
        if (error) {
          this.winstonLogger.error(error);
          process.exit(1);
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
      throw new Error(
        'Session store is not initialized. Call connectSessionStore() first.',
      );
    }
    return this.store;
  }
}

export { DBConnection };
