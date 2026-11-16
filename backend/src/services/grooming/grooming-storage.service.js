import { groomingModels } from '../../models/grooming-appointment.model.js';
import { AppError } from '../../utils/app-error.js';

// Run before GROOMING_BOOKING_ENABLED=true: production startup refuses registered models without their collections.
export async function provisionGroomingStorage(connection) {
  for (const name of ['groomingslots', 'groomingcommands']) {
    if (await connection.db.collection(name).findOne({}, { projection: { _id: 1 }, maxTimeMS: 5000 }))
      throw new AppError(409, 'GROOMING_MIGRATION_REQUIRED', 'Existing legacy Grooming storage requires reviewed reconciliation');
  }
  if (await connection.db.collection('groomingappointments').findOne({ $or: [
    { 'requestReceipt.key': { $exists: false } }, { pets: { $elemMatch: { reservedSitterId: { $exists: false } } } }
  ] }, { projection: { _id: 1 }, maxTimeMS: 5000 }))
    throw new AppError(409, 'GROOMING_MIGRATION_REQUIRED', 'Existing appointments require reservation and receipt migration');
  for (const model of Object.values(groomingModels(connection))) {
    await model.createCollection();
    await model.createIndexes();
  }
}
