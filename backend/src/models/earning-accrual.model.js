import { Schema } from 'mongoose';

const money = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };
const reference = { type: String, required: true, maxlength: 160 };

export function earningAccrualModels(connection) {
  const snapshot = new Schema({
    id: { ...reference, immutable: true },
    bookingId: { ...reference, immutable: true },
    sitterId: { ...reference, immutable: true },
    completedAt: { type: Date, required: true, immutable: true },
    weekKey: { ...reference, immutable: true },
    ordinal: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
    serviceBasisVnd: { ...money, immutable: true },
    feeBasisPoints: { ...money, max: 10000, immutable: true },
    commissionVnd: { ...money, immutable: true },
    confirmedTaxVnd: { ...money, immutable: true },
    sitterTaxCostVnd: { ...money, immutable: true },
    platformTaxCostVnd: { ...money, immutable: true },
    accruedVnd: { ...money, immutable: true },
    policyVersion: { ...reference, immutable: true },
    decisionVersion: { ...reference, immutable: true },
    sourceVersion: { ...reference, immutable: true },
    sourceHash: { ...reference, immutable: true },
    completionReference: { ...reference, immutable: true },
    paymentReference: { ...reference, immutable: true },
    allocationReference: { ...reference, immutable: true },
    assessmentReference: { ...reference, immutable: true },
    createdAt: { type: Date, required: true, immutable: true }
  }, { strict: 'throw', versionKey: false, bufferCommands: false });
  snapshot.index({ id: 1 }, { unique: true });
  snapshot.index({ sitterId: 1, bookingId: 1 }, { unique: true });
  snapshot.index({ sitterId: 1, weekKey: 1, ordinal: 1 }, { unique: true });
  const counter = new Schema({
    sitterId: reference, weekKey: reference,
    count: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
  }, { strict: 'throw', versionKey: false, bufferCommands: false });
  counter.index({ sitterId: 1, weekKey: 1 }, { unique: true });
  const completion = new Schema({
    bookingId: { ...reference, immutable: true }, sitterId: { ...reference, immutable: true },
    completedAt: { type: Date, required: true, immutable: true },
    weekKey: { ...reference, immutable: true },
    ordinal: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
    completionReference: { ...reference, immutable: true }
  }, { strict: 'throw', versionKey: false, bufferCommands: false });
  completion.index({ sitterId: 1, bookingId: 1 }, { unique: true });
  completion.index({ sitterId: 1, weekKey: 1, ordinal: 1 }, { unique: true });
  const outbox = new Schema({
    eventId: { ...reference, immutable: true },
    type: { type: String, enum: ['EARNING_ACCRUED'], required: true, immutable: true },
    snapshotId: { ...reference, immutable: true },
    state: { type: String, enum: ['PENDING', 'PUBLISHED'], required: true },
    createdAt: { type: Date, required: true, immutable: true }
  }, { strict: 'throw', versionKey: false, bufferCommands: false });
  outbox.index({ eventId: 1 }, { unique: true });
  outbox.index({ state: 1, createdAt: 1 });
  return {
    BookingEarningSnapshot: connection.models.BookingEarningSnapshot
      ?? connection.model('BookingEarningSnapshot', snapshot),
    WeeklyBookingCounter: connection.models.WeeklyBookingCounter
      ?? connection.model('WeeklyBookingCounter', counter),
    CompletedBookingOrdinal: connection.models.CompletedBookingOrdinal
      ?? connection.model('CompletedBookingOrdinal', completion),
    EarningAccrualOutbox: connection.models.EarningAccrualOutbox
      ?? connection.model('EarningAccrualOutbox', outbox)
  };
}
