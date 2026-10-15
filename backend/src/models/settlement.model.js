import { Schema } from 'mongoose';

const BUCKETS = ['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID'];
const REQUEST_STATES = ['SUBMITTED', 'APPROVED', 'REJECTED', 'TRANSFER_PENDING', 'PAID'];

const money = {
  type: Number,
  required: true,
  min: 0,
  max: Number.MAX_SAFE_INTEGER,
  validate: Number.isSafeInteger
};
const nullableMoney = {
  type: Number,
  default: null,
  min: 0,
  max: Number.MAX_SAFE_INTEGER,
  validate: value => value === null || Number.isSafeInteger(value)
};

const transferSchema = new Schema({
  outcome: { type: String, enum: ['CONFIRMED', 'UNKNOWN', 'AMOUNT_MISMATCH'], required: true },
  reference: { type: String, required: true, maxlength: 160 },
  evidenceReference: { type: String, required: true, maxlength: 160 },
  amountVnd: nullableMoney,
  paidAt: { type: Date, default: null },
  recordedBy: { type: String, required: true, maxlength: 128 },
  recordedAt: { type: Date, required: true }
}, { _id: false, strict: 'throw' });

const earningSnapshotSchema = new Schema({
  earningId: { type: String, required: true, maxlength: 128 },
  visitId: { type: String, default: null, maxlength: 128 },
  earningPeriodKey: { type: String, required: true, maxlength: 80 },
  amountVnd: money,
  pendingVnd: { ...money, default: 0 },
  heldVnd: { ...money, default: 0 },
  availableVnd: { ...money, default: 0 },
  reservedVnd: { ...money, default: 0 },
  paidVnd: { ...money, default: 0 },
  explanation: { type: String, default: null, maxlength: 500 },
  ledgerReference: { type: String, default: null, maxlength: 128 },
  transferRecordedAt: { type: Date, default: null }
}, { _id: false, strict: 'throw' });

function model(connection, name, schema) {
  return connection.models[name] ?? connection.model(name, schema);
}

export function settlementModels(connection) {
  if (!connection?.models || typeof connection.model !== 'function') {
    throw new TypeError('Database connection is required');
  }

  const requestSchema = new Schema({
    id: { type: String, required: true, immutable: true, maxlength: 128 },
    sitterId: { type: String, required: true, immutable: true, maxlength: 128 },
    requestWeekKey: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startsAt: { type: Date, required: true, immutable: true },
    endsAt: { type: Date, required: true, immutable: true },
    earningIds: { type: [String], required: true, immutable: true, validate: value => value.length > 0 },
    earningSnapshots: { type: [earningSnapshotSchema], default: undefined, immutable: true },
    amountVnd: money,
    currency: { type: String, enum: ['VND'], required: true, default: 'VND', immutable: true },
    status: { type: String, enum: REQUEST_STATES, required: true },
    version: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    submittedAt: { type: Date, required: true, immutable: true },
    policyVersion: { type: String, required: true, maxlength: 128 },
    decisionVersion: { type: String, required: true, maxlength: 128 },
    decision: { type: Schema.Types.Mixed, default: null },
    transfer: { type: transferSchema, default: null }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  requestSchema.index({ id: 1 }, { unique: true });
  // A rejected/unknown request remains the claim for this calendar week.
  requestSchema.index({ sitterId: 1, requestWeekKey: 1 }, { unique: true });
  requestSchema.index({ status: 1, submittedAt: -1, id: -1 });
  requestSchema.index({ sitterId: 1, submittedAt: -1, id: -1 });

  const claimSchema = new Schema({
    id: { type: String, required: true, immutable: true, maxlength: 128 },
    sitterId: { type: String, required: true, immutable: true, maxlength: 128 },
    requestWeekKey: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startsAt: { type: Date, required: true, immutable: true },
    endsAt: { type: Date, required: true, immutable: true }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  claimSchema.index({ id: 1 }, { unique: true });
  claimSchema.index({ sitterId: 1, requestWeekKey: 1 }, { unique: true });

  const earningSchema = new Schema({
    earningId: { type: String, required: true, immutable: true, maxlength: 128 },
    sitterId: { type: String, required: true, immutable: true, maxlength: 128 },
    visitId: { type: String, default: null, immutable: true, maxlength: 128 },
    earningPeriodKey: { type: String, required: true, immutable: true, maxlength: 80 },
    accruedVnd: money,
    pendingVnd: { ...money, default: 0 },
    heldVnd: { ...money, default: 0 },
    availableVnd: { ...money, default: 0 },
    reservedVnd: { ...money, default: 0 },
    paidVnd: { ...money, default: 0 },
    explanation: { type: String, default: null, maxlength: 500 },
    ledgerReference: { type: String, default: null, maxlength: 128 },
    transferRecordedAt: { type: Date, default: null },
    state: { type: String, enum: ['PENDING', 'HELD', 'AVAILABLE', 'RESERVED', 'PAID'], required: true },
    reservation: {
      requestId: { type: String, default: null, maxlength: 128 },
      reservedAt: { type: Date, default: null }
    },
    version: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  earningSchema.index({ earningId: 1 }, { unique: true });
  earningSchema.index({ sitterId: 1, state: 1, earningPeriodKey: 1, earningId: 1 });
  earningSchema.index({ sitterId: 1, visitId: 1 }, { unique: true, sparse: true });
  earningSchema.index({ 'reservation.requestId': 1, state: 1 });

  const lockSchema = new Schema({
    resourceType: { type: String, enum: ['EARNING', 'ALLOCATION', 'REFUND', 'CASE'], required: true },
    resourceId: { type: String, required: true, maxlength: 128 },
    lockType: { type: String, enum: ['REFUND', 'CASE', 'SETTLEMENT', 'HOLD'], required: true },
    reference: { type: String, required: true, maxlength: 160 },
    state: { type: String, enum: ['ACTIVE', 'RELEASED'], required: true },
    actorId: { type: String, default: null, maxlength: 128 },
    createdAt: { type: Date, required: true },
    releasedAt: { type: Date, default: null }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  lockSchema.index({ resourceType: 1, resourceId: 1, lockType: 1, reference: 1 }, { unique: true });
  lockSchema.index({ resourceType: 1, resourceId: 1, state: 1, lockType: 1 });

  const ledgerSchema = new Schema({
    lineId: { type: String, required: true, immutable: true, maxlength: 220 },
    operationId: { type: String, required: true, immutable: true, maxlength: 160 },
    requestId: { type: String, default: null, immutable: true, maxlength: 128 },
    earningId: { type: String, required: true, immutable: true, maxlength: 128 },
    sitterId: { type: String, required: true, immutable: true, maxlength: 128 },
    fromBucket: { type: String, enum: [...BUCKETS, null], default: null, immutable: true },
    toBucket: { type: String, enum: BUCKETS, required: true, immutable: true },
    amountVnd: money,
    policyVersion: { type: String, default: null, maxlength: 128, immutable: true },
    decisionVersion: { type: String, default: null, maxlength: 128, immutable: true },
    actorId: { type: String, default: null, maxlength: 128, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  ledgerSchema.index({ lineId: 1 }, { unique: true });
  ledgerSchema.index({ sitterId: 1, occurredAt: 1, lineId: 1 });
  ledgerSchema.index({ earningId: 1, occurredAt: 1, lineId: 1 });

  const commandSchema = new Schema({
    actorId: { type: String, required: true, immutable: true, maxlength: 128 },
    operation: { type: String, required: true, immutable: true, maxlength: 80 },
    key: { type: String, required: true, immutable: true, maxlength: 128 },
    fingerprint: { type: String, required: true, immutable: true, maxlength: 128 },
    result: { type: Schema.Types.Mixed, required: true, immutable: true },
    createdAt: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  commandSchema.index({ actorId: 1, operation: 1, key: 1 }, { unique: true });
  commandSchema.index({ createdAt: 1 });

  const eventSchema = new Schema({
    eventId: { type: String, required: true, immutable: true, maxlength: 128 },
    operationId: { type: String, required: true, immutable: true, maxlength: 160 },
    requestId: { type: String, required: true, immutable: true, maxlength: 128 },
    type: { type: String, required: true, immutable: true, maxlength: 100 },
    actorId: { type: String, default: null, maxlength: 128, immutable: true },
    earningIds: { type: [String], default: undefined, immutable: true },
    amountVnd: { ...nullableMoney, immutable: true },
    fromBucket: { type: String, enum: [...BUCKETS, null], default: null, immutable: true },
    toBucket: { type: String, enum: BUCKETS, default: null, immutable: true },
    reason: { type: String, default: null, maxlength: 500, immutable: true },
    transfer: { type: Schema.Types.Mixed, default: null, immutable: true },
    policyVersion: { type: String, default: null, maxlength: 128, immutable: true },
    decisionVersion: { type: String, default: null, maxlength: 128, immutable: true },
    aggregateVersion: { type: Number, default: null, min: 0, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  eventSchema.index({ operationId: 1 }, { unique: true });
  eventSchema.index({ requestId: 1, occurredAt: 1, eventId: 1 });

  const outboxSchema = new Schema({
    eventId: { type: String, required: true, immutable: true, maxlength: 128 },
    operationId: { type: String, required: true, immutable: true, maxlength: 160 },
    requestId: { type: String, required: true, immutable: true, maxlength: 128 },
    type: { type: String, required: true, immutable: true, maxlength: 100 },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    state: { type: String, enum: ['PENDING', 'PUBLISHED', 'FAILED'], required: true, default: 'PENDING' },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    createdAt: { type: Date, required: true },
    publishedAt: { type: Date, default: null }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  outboxSchema.index({ operationId: 1 }, { unique: true });
  outboxSchema.index({ state: 1, createdAt: 1 });

  const transferSchemaRoot = new Schema({
    requestId: { type: String, required: true, immutable: true, maxlength: 128 },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
    adminId: { type: String, required: true, immutable: true, maxlength: 128 },
    outcome: { type: String, enum: ['CONFIRMED', 'UNKNOWN', 'AMOUNT_MISMATCH'], required: true, immutable: true },
    reference: { type: String, required: true, maxlength: 160, immutable: true },
    evidenceReference: { type: String, required: true, maxlength: 160, immutable: true },
    amountVnd: { ...nullableMoney, immutable: true },
    paidAt: { type: Date, default: null, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  transferSchemaRoot.index({ requestId: 1, version: 1 }, { unique: true });
  transferSchemaRoot.index({ reference: 1 }, { unique: true });
  transferSchemaRoot.index({ evidenceReference: 1 }, { unique: true });

  const evidenceSchema = new Schema({
    evidenceReference: { type: String, required: true, immutable: true, maxlength: 160 },
    requestId: { type: String, required: true, immutable: true, maxlength: 128 },
    ownerActorId: { type: String, required: true, immutable: true, maxlength: 128 },
    mediaId: { type: String, required: true, immutable: true, maxlength: 160 },
    state: { type: String, enum: ['UPLOADED', 'REVOKED'], required: true, default: 'UPLOADED' },
    uploadedAt: { type: Date, required: true, immutable: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  evidenceSchema.index({ evidenceReference: 1 }, { unique: true });
  evidenceSchema.index({ requestId: 1, ownerActorId: 1, state: 1 });

  return Object.freeze({
    SettlementRequest: model(connection, 'SettlementRequest', requestSchema),
    SettlementWeekClaim: model(connection, 'SettlementWeekClaim', claimSchema),
    Earning: model(connection, 'Earning', earningSchema),
    FinancialLock: model(connection, 'FinancialLock', lockSchema),
    EarningLedgerEntry: model(connection, 'EarningLedgerEntry', ledgerSchema),
    SettlementCommand: model(connection, 'SettlementCommand', commandSchema),
    SettlementEvent: model(connection, 'SettlementEvent', eventSchema),
    SettlementOutbox: model(connection, 'SettlementOutbox', outboxSchema),
    SettlementTransfer: model(connection, 'SettlementTransfer', transferSchemaRoot),
    SettlementEvidence: model(connection, 'SettlementEvidence', evidenceSchema)
  });
}

export const settlementBucketNames = Object.freeze([...BUCKETS]);
