import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { provisionBookingReadStorage } from '../../src/services/booking-read-storage.service.js';

let connection;
try {
  const config = loadConfig(), apply = process.argv.includes('--apply');
  if (apply && (process.env.CONFIRMED_BOOKING_INDEX_DATABASE !== config.database
    || !/^[a-f0-9]{64}$/.test(process.env.CONFIRMED_BOOKING_INDEX_DIGEST ?? '')
    || process.env.CONFIRMED_BOOKING_INDEX !== 'customerId:1,_id:-1')) throw new Error('Explicit database/digest/index confirmation required');
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database,
    autoCreate: false, autoIndex: false, maxPoolSize: 1, serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000 }).asPromise();
  console.log(JSON.stringify(await provisionBookingReadStorage({ connection, apply,
    expectedDigest: process.env.CONFIRMED_BOOKING_INDEX_DIGEST })));
} catch {
  console.error('Booking owner index stopped; inspect aggregate preflight, reviewed plan and backup/restore gates');
  process.exitCode = 1;
} finally { await connection?.close(); }
