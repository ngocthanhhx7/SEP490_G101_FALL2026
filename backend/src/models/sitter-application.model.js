import { Schema } from 'mongoose';
import { applicationMailModel } from './application-mail.model.js';

const STATES = ['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'];

export function sitterApplicationModels(connection) {
  const documentSchema = new Schema({
    documentId: { type: String, required: true },
    documentType: { type: String, enum: ['IDENTITY', 'CERTIFICATE', 'OTHER'], required: true },
    storageRef: { type: String, required: true, select: false }
  }, { _id: false, strict: 'throw' });

  const applicantSchema = new Schema({
    ownerUserId: { type: Schema.Types.ObjectId, default: null, index: true },
    policyConsents: { type: [new Schema({
      slug: String, versionId: String, contentHash: String, effectiveAt: Date, consentedAt: Date, sourceRef: String
    }, { _id: false, strict: 'throw' })], default: [], immutable: true },
    displayName: { type: String, required: true, maxlength: 100 },
    contactChannel: { type: String, enum: ['EMAIL', 'PHONE'], required: true },
    contactCiphertext: { type: String, required: true, select: false },
    contactLookupKey: { type: String, required: true, select: false },
    identityLookupKey: { type: String, required: true, select: false },
    activePendingOwnerUserId: { type: Schema.Types.ObjectId, select: false },
    activePendingContactKey: { type: String, select: false },
    activePendingIdentityKey: { type: String, select: false },
    ageEligible: { type: Boolean, required: true, enum: [true] },
    ageCheckedAt: { type: Date, required: true },
    experience: { type: String, required: true, maxlength: 2000 },
    employmentType: { type: String, enum: ['FULL_TIME', 'PART_TIME', null], default: null },
    requestedServices: { type: [String], required: true, validate: value => value.length > 0 },
    workAreas: { type: [String], required: true, validate: value => value.length > 0 },
    privateDocuments: { type: [documentSchema], required: true, validate: value => value.length > 0 },
    state: { type: String, enum: STATES, required: true, default: 'PENDING' },
    interviewNote: { type: String, default: null, maxlength: 2000 },
    decisionReason: { type: String, default: null, maxlength: 1000 },
    rejectedAt: { type: Date, default: null },
    reapplyAt: { type: Date, default: null },
    provisionedUserId: { type: Schema.Types.ObjectId, default: null },
    version: { type: Number, required: true, min: 0, default: 0 },
    trackingCodeDigest: { type: String, select: false },
    submissionKeyDigest: { type: String, required: true, select: false },
    submissionPayloadDigest: { type: String, required: true, select: false }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  applicantSchema.index({ activePendingOwnerUserId: 1 }, { unique: true, sparse: true });
  applicantSchema.index({ activePendingContactKey: 1 }, { unique: true, sparse: true });
  applicantSchema.index({ activePendingIdentityKey: 1 }, { unique: true, sparse: true });
  applicantSchema.index({ state: 1, createdAt: -1, _id: -1 });
  applicantSchema.index({ submissionKeyDigest: 1 }, { unique: true });
  applicantSchema.index({ trackingCodeDigest: 1 }, { unique: true, sparse: true });
  applicantSchema.index({ identityLookupKey: 1, rejectedAt: -1 });

  const auditSchema = new Schema({
    actorId: { type: Schema.Types.ObjectId, default: null },
    actorRoles: { type: [String], required: true, default: [] },
    action: {
      type: String,
      enum: ['APPLICATION_SUBMITTED', 'APPLICATION_VIEWED', 'APPLICATION_REVIEW_STARTED',
        'APPLICATION_DECIDED', 'APPLICATION_DOCUMENT_REQUESTED', 'SITTER_SUSPENDED', 'SITTER_REINSTATED'],
      required: true
    },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    occurredAt: { type: Date, required: true },
    state: { type: String, enum: STATES, default: null },
    decision: { type: String, enum: ['APPROVE', 'REJECT', null], default: null },
    reasonDigest: { type: String, default: null, select: false },
    idempotencyDigest: { type: String, default: null, select: false },
    payloadDigest: { type: String, default: null, select: false },
    resultVersion: { type: Number, default: null },
    resultUserId: { type: Schema.Types.ObjectId, default: null },
    reapplyAt: { type: Date, default: null },
    documentId: { type: String, default: null },
    correlationId: { type: String, default: null, maxlength: 128 }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  auditSchema.index({ resourceId: 1, occurredAt: -1 });
  auditSchema.index({ actorId: 1, occurredAt: -1 });
  auditSchema.index({ resourceId: 1, idempotencyDigest: 1 }, {
    unique: true, partialFilterExpression: { idempotencyDigest: { $type: 'string' } }
  });

  const quotaSchema = new Schema({
    actorId: { type: Schema.Types.ObjectId, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, min: 0, default: 0 }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  quotaSchema.index({ actorId: 1, windowStart: 1 }, { unique: true });

  const sitterStatusSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], required: true },
    statusReason: { type: String, default: null, maxlength: 1000, select: false },
    changedAt: { type: Date, required: true },
    version: { type: Number, required: true, min: 0, default: 0 }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  sitterStatusSchema.index({ userId: 1 }, { unique: true });

  return Object.freeze({
    ApplicationMail: applicationMailModel(connection),
    SitterApplication: connection.models.SitterApplication ?? connection.model('SitterApplication', applicantSchema),
    SitterApplicationAudit: connection.models.SitterApplicationAudit ?? connection.model('SitterApplicationAudit', auditSchema),
    SitterApplicationDownloadQuota: connection.models.SitterApplicationDownloadQuota
      ?? connection.model('SitterApplicationDownloadQuota', quotaSchema),
    SitterStatus: connection.models.SitterStatus ?? connection.model('SitterStatus', sitterStatusSchema)
  });
}
