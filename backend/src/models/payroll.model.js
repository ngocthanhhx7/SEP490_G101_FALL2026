import { Schema } from 'mongoose';
const oid = Schema.Types.ObjectId;
const money = { type: Number, min: 0, validate: Number.isSafeInteger };
export function payrollModels(connection) {
  const options = { strict: 'throw', bufferCommands: false, versionKey: false };
  const contracts = new Schema({
    employeeId: { type: oid, required: true }, version: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
    employmentType: { type: String, enum: ['FULL_TIME', 'PART_TIME'], required: true },
    salaryBasis: { type: String, enum: ['GROSS', 'NET'], required: true },
    monthlyBaseVnd: { ...money, required: true }, payCycle: { type: String, enum: ['MONTHLY', 'WEEKLY'], required: true },
    weeklyMinutes: { type: Number, required: true, min: 1, max: 2880, validate: Number.isSafeInteger },
    signedAt: { type: Date, required: true }, effectiveAt: { type: Date, required: true }, endsAt: Date,
    contractReference: { type: String, required: true, maxlength: 160, select: false },
    workplaceRegion: { type: Number, enum: [1, 2, 3, 4], required: true },
    workplaceReference: { type: String, required: true, maxlength: 160 },
    verifiedBy: { type: oid, required: true }, recordedAt: { type: Date, required: true }
  }, options);
  contracts.index({ employeeId: 1, version: 1 }, { unique: true });
  contracts.index({ employeeId: 1, effectiveAt: -1 });
  const advances = new Schema({
    employeeId: { type: oid, required: true }, contractId: { type: oid, required: true },
    monthKey: { type: String, required: true }, amountVnd: { ...money, required: true },
    status: { type: String, enum: ['SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PAID'], required: true },
    version: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    reason: { type: String, required: true, maxlength: 1000 },
    decisionReason: { type: String, maxlength: 1000 }, requestedAt: { type: Date, required: true },
    decidedBy: oid, decidedAt: Date, paidBy: oid, paidAt: Date,
    transferReference: { type: String, maxlength: 160, select: false },
    policyVersion: { type: String, required: true },
    settlementPeriod: { type: String, required: true },
    settlementConsentReference: { type: String, required: true, maxlength: 160, select: false }
  }, options);
  advances.index({ employeeId: 1, monthKey: 1, status: 1, requestedAt: -1 });
  advances.index({ employeeId: 1, requestedAt: -1, _id: -1 });
  advances.index({ status: 1, requestedAt: -1, _id: -1 });
  advances.index({ transferReference: 1 }, { unique: true, partialFilterExpression: { transferReference: { $type: 'string' } } });
  const guards = new Schema({ _id: String, version: { type: Number, default: 0 }, pendingId: oid, approvedId: oid }, options);
  const commands = new Schema({ _id: String, fingerprint: String, result: Schema.Types.Mixed, createdAt: Date }, options);
  const events = new Schema({ employeeId: oid, resourceId: oid, actorId: oid, type: String, reason: String, at: Date }, options);
  const credits = new Schema({
    visitId: { type: oid, required: true, unique: true }, bookingId: { type: oid, required: true }, employeeId: { type: oid, required: true },
    completedAt: { type: Date, required: true }, serviceNetVnd: { ...money, required: true },
    careMinutes: { type: Number, min: 0, max: 1440, validate: Number.isSafeInteger, required: true },
    onTime: { type: Boolean, required: true }, reportsComplete: { type: Boolean, required: true },
    sourceVersion: { type: Number, required: true }, policyVersion: { type: String, required: true }
  }, options);
  credits.index({ employeeId: 1, completedAt: 1, _id: 1 });
  const statements = new Schema({
    employeeId: { type: oid, required: true }, contractId: { type: oid, required: true },
    periodStart: { type: Date, required: true }, periodEnd: { type: Date, required: true }, monthKey: { type: String, required: true },
    dueAt: { type: Date, required: true }, payCycle: { type: String, enum: ['MONTHLY', 'WEEKLY'], required: true },
    status: { type: String, enum: ['PREPARED', 'APPROVED', 'PAID', 'VOIDED'], required: true }, version: { type: Number, default: 0 },
    breakdown: { type: Schema.Types.Mixed, required: true }, assessment: { type: Schema.Types.Mixed, required: true, select: false },
    creditIds: [{ type: oid }], advanceIds: [{ type: oid }],
    preparedBy: { type: oid, required: true }, preparedAt: { type: Date, required: true },
    approvedBy: oid, approvedAt: Date, paidBy: oid, paidAt: Date,
    voidedBy: oid, voidedAt: Date, voidReason: { type: String, maxlength: 1000 },
    transferReference: { type: String, maxlength: 160, select: false }
  }, options);
  statements.index({ employeeId: 1, periodStart: 1, periodEnd: 1 }, { name: 'active_payroll_period', unique: true,
    partialFilterExpression: { status: { $in: ['PREPARED', 'APPROVED', 'PAID'] } } });
  statements.index({ transferReference: 1 }, { unique: true, partialFilterExpression: { transferReference: { $type: 'string' } } });
  statements.index({ employeeId: 1, periodEnd: -1, _id: -1 });
  statements.index({ periodEnd: -1, _id: -1 });
  const claims = new Schema({ _id: String, statementId: oid, advanceId: oid }, options);
  const defs = { EmploymentContract: contracts, SalaryAdvance: advances, PayrollMonthGuard: guards, PayrollCommand: commands,
    PayrollEvent: events, PayrollServiceCredit: credits, PayrollStatement: statements, PayrollSourceClaim: claims };
  return Object.fromEntries(Object.entries(defs).map(([name, schema]) => [name, connection.models[name] ?? connection.model(name, schema)]));
}
