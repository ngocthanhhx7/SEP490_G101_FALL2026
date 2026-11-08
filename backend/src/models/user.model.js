import { Schema } from 'mongoose';
import { concurrencyGuardField } from './concurrency-guard.field.js';
import { ACCOUNT_ROLES } from '../constants/account-roles.js';
import { singleAccountRoleOptions } from './user-role.storage.js';

export function userModel(connection) {
  const policyConsentSchema = new Schema({
    slug: { type: String, enum: ['terms', 'privacy'], required: true },
    versionId: { type: String, required: true, maxlength: 80 },
    contentHash: { type: String, required: true, maxlength: 128 },
    effectiveAt: { type: Date, required: true },
    consentedAt: { type: Date, required: true },
    sourceRef: { type: String, required: true, maxlength: 500 },
  }, { _id: false, strict: 'throw' });
  const schema = new Schema({
    contractGuard: concurrencyGuardField(),
    schedulingGuardVersion: concurrencyGuardField(),
    displayName: { type: String, required: true, maxlength: 100 },
    roles: { type: [String], enum: [...ACCOUNT_ROLES], required: true,
      validate: { validator: roles => Array.isArray(roles) && roles.length === 1,
        message: 'Each account must have exactly one role' } },
    state: { type: String, enum: ['ACTIVE', 'LOCKED', 'SUSPENDED'], required: true },
    authEpoch: { type: Number, required: true, min: 0, default: 0 },
    version: { type: Number, required: true, min: 0, default: 0 },
    synthetic: { type: Boolean, default: false },
    fixtureKey: { type: String },
    policyConsents: { type: [policyConsentSchema], default: undefined, immutable: true },
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false,
    collectionOptions: singleAccountRoleOptions });
  schema.index({ fixtureKey: 1 }, { unique: true, sparse: true });
  return connection.models.User ?? connection.model('User', schema);
}
