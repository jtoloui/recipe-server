import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '', {
      autoCreate: true,
      dbName: 'recipe',
      appName: 'recipe-api',
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};
