import { Schema } from 'mongoose';

export function userModel(connection) {
  const schema = new Schema({
    displayName: { type: String, required: true, maxlength: 100 },
    roles: { type: [String], enum: ['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'], required: true },
    state: { type: String, enum: ['ACTIVE', 'LOCKED', 'SUSPENDED'], required: true },
    authEpoch: { type: Number, required: true, min: 0, default: 0 },
    version: { type: Number, required: true, min: 0, default: 0 },
    synthetic: { type: Boolean, default: false },
    fixtureKey: { type: String }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ fixtureKey: 1 }, { unique: true, sparse: true });
  return connection.models.User ?? connection.model('User', schema);
}
