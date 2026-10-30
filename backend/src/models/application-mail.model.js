import { Schema } from 'mongoose';

export function applicationMailModel(connection) {
  const schema = new Schema({
    _id: String,
    applicationId: { type: Schema.Types.ObjectId, required: true, index: true },
    ownerUserId: Schema.Types.ObjectId,
    applicationVersion: { type: Number, required: true },
    applicationState: { type: String, enum: ['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'], required: true },
    contactCiphertext: { type: String, select: false },
    operationId: { type: String, required: true },
    deliveryState: { type: String, enum: ['PENDING', 'SENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'SKIPPED'], required: true },
    attempts: { type: Number, default: 0 },
    failureCode: { type: String, default: null },
    createdAt: { type: Date, required: true },
    nextAttemptAt: { type: Date, required: true },
    leaseUntil: { type: Date, default: null },
    acceptedAt: { type: Date, default: null }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ deliveryState: 1, nextAttemptAt: 1 });
  return connection.models.ApplicationMail ?? connection.model('ApplicationMail', schema, 'application_mails');
}
