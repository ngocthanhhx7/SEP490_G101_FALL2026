import { Schema } from 'mongoose';

export function servicePolicyVersionModel(connection) {
  const schema = new Schema({
    serviceId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    state: { type: String, enum: ['PUBLISHED', 'WITHDRAWN'], required: true },
    title: { type: String, trim: true, minlength: 2, maxlength: 120 },
    body: { type: String, trim: true, minlength: 3, maxlength: 10000 },
    effectiveAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    recordedAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ serviceId: 1, version: 1 }, { unique: true });
  schema.index({ serviceId: 1, effectiveAt: 1 }, { unique: true });
  schema.index({ state: 1, effectiveAt: 1, serviceId: 1 });
  return connection.models.ServicePolicyVersion ?? connection.model('ServicePolicyVersion', schema);
}
