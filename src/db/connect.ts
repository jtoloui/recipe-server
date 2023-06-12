import dotenv from 'dotenv';
import mongoose from 'mongoose';

import logger from '../logger/winston';

dotenv.config();

export const connectDB = async () => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const winstonLogger = logger(logLevel, 'database');
  try {
    // winston logger
    await mongoose.connect(process.env.MONGODB_URI || '', {
      autoCreate: true,
      dbName: 'recipe',
      appName: 'recipe-api',
    });
    winstonLogger.info('MongoDB connected successfully');
  } catch (error) {
    winstonLogger.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};
