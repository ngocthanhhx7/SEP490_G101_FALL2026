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
  const emergencyContactSchema = new Schema({
    name: { type: String, required: true, maxlength: 100 },
    phone: { type: String, required: true, maxlength: 30 },
    relationship: { type: String, required: true, maxlength: 40 },
  }, { _id: false, strict: 'throw' });
  const schema = new Schema({
    contractGuard: concurrencyGuardField(),
    schedulingGuardVersion: concurrencyGuardField(),
    displayName: { type: String, required: true, maxlength: 100 },
    familyAndMiddleName: { type: String, maxlength: 100, select: false },
    givenName: { type: String, maxlength: 100, select: false },
    birthDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, select: false },
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED', null], select: false },
    emergencyContact: { type: emergencyContactSchema, default: undefined, select: false },
    roles: { type: [String], enum: [...ACCOUNT_ROLES], required: true,
      validate: { validator: roles => Array.isArray(roles) && roles.length === 1,
        message: 'Each account must have exactly one role' } },
    state: { type: String, enum: ['ACTIVE', 'LOCKED', 'SUSPENDED'], required: true },
    authEpoch: { type: Number, required: true, min: 0, default: 0 },
    version: { type: Number, required: true, min: 0, default: 0 },
    synthetic: { type: Boolean, default: false },
    // Counter-created customers have not proven possession of their phone yet.
    createdChannel: { type: String, enum: ['COUNTER'], default: undefined },
    createdBy: { type: Schema.Types.ObjectId, default: undefined },
    fixtureKey: { type: String },
    policyConsents: { type: [policyConsentSchema], default: undefined, immutable: true },
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false,
    collectionOptions: singleAccountRoleOptions });
  schema.index({ fixtureKey: 1 }, { unique: true, sparse: true });
  return connection.models.User ?? connection.model('User', schema);
}
