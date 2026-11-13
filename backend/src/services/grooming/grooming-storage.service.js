import { groomingModels } from '../../models/grooming-appointment.model.js';

// Run before GROOMING_BOOKING_ENABLED=true: production startup refuses registered models without their collections.
export async function provisionGroomingStorage(connection) {
  for (const model of Object.values(groomingModels(connection))) {
    await model.createCollection();
    await model.createIndexes();
  }
}
