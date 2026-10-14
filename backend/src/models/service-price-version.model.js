import { Schema } from 'mongoose';

export function servicePriceVersionModel(connection) {
  const schema = new Schema({
    serviceId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    amountVnd: {
      type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger
    },
    currency: { type: String, enum: ['VND'], required: true, default: 'VND' },
    unitLabel: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    effectiveAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    recordedAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ serviceId: 1, version: 1 }, { unique: true });
  schema.index({ serviceId: 1, effectiveAt: 1 }, { unique: true });
  schema.index({ serviceId: 1, effectiveAt: -1, version: -1 });
  return connection.models.ServicePriceVersion ?? connection.model('ServicePriceVersion', schema);
}
