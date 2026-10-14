import { Schema } from 'mongoose';

const SPECIES = ['DOG', 'CAT'];
const STATES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

export function serviceVersionModel(connection) {
  const schema = new Schema({
    serviceId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    scope: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    species: { type: [{ type: String, enum: SPECIES }], required: true, validate: value => value.length > 0 },
    state: { type: String, enum: STATES, required: true },
    effectiveAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
    recordedAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ serviceId: 1, version: 1 }, { unique: true });
  schema.index({ serviceId: 1, effectiveAt: 1 }, { unique: true });
  schema.index({ state: 1, effectiveAt: 1, serviceId: 1 });
  return connection.models.ServiceVersion ?? connection.model('ServiceVersion', schema);
}
