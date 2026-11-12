import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { provisionBookingChanges } from '../../src/services/booking-change/booking-change-store.js';

if (!process.argv.includes('--apply')) console.log('DRY_RUN: booking change collections and indexes');
else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev')) throw new Error('Development database required');
    connection = await connectDatabase(config);
    await provisionBookingChanges(connection);
    console.log('APPLIED: booking change storage');
  } catch {
    console.error('Booking change storage provisioning failed');
    process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}
