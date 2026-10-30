import { Schema } from 'mongoose';

export function financeSourceModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false, autoIndex: false };
  const command = new Schema({ _id: String, fingerprint: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true }, createdAt: { type: Date, required: true } }, options);
  const event = new Schema({ _id: String, type: { type: String, required: true }, bookingId: String,
    actorId: String, resourceId: String, at: { type: Date, required: true } }, options);
  const task = new Schema({ _id: String, bookingId: { type: String, required: true },
    sitterId: { type: String, required: true }, state: { type: String, enum: ['PENDING', 'DONE'], required: true },
    revision: { type: Number, required: true }, nextAttemptAt: { type: Date, required: true },
    lastCode: String, updatedAt: { type: Date, required: true } }, options);
  task.index({ state: 1, nextAttemptAt: 1 });
  const binding = new Schema({ _id: String, visitId: { type: String, required: true },
    kind: { type: String, enum: ['CHECK_IN', 'CHECK_OUT'], required: true }, ownerId: String,
    contentDigest: String, createdAt: { type: Date, required: true } }, options);
  binding.index({ visitId: 1, kind: 1 }, { unique: true });
  return {
    FinanceSourceCommand: connection.models.FinanceSourceCommand ?? connection.model('FinanceSourceCommand', command),
    FinanceSourceEvent: connection.models.FinanceSourceEvent ?? connection.model('FinanceSourceEvent', event),
    EarningAccrualTask: connection.models.EarningAccrualTask ?? connection.model('EarningAccrualTask', task),
    CareMediaBinding: connection.models.CareMediaBinding ?? connection.model('CareMediaBinding', binding)
  };
}
