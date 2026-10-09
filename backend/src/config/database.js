import mongoose from 'mongoose';
import { config } from './env.js';

export async function connectDatabase() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
  });

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    await mongoose.disconnect();
    throw new Error('MongoDB replica set is required; standalone MongoDB is not supported.');
  }

  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
