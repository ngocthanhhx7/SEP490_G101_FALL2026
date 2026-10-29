import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';
import { earningAccrualModels } from '../../models/earning-accrual.model.js';
import { settlementModels } from '../../models/settlement.model.js';
import { createMongoSettlementRepository } from './mongo-settlement.repository.js';
import { vietnamRequestWeek } from './week.js';
import { WEEKLY_COMMISSION_TIERS, WEEKLY_COMMISSION_VERSION,
  previewEqualTaxCostSplit } from './weekly-commission.js';
import { BOOKING_ALLOCATION_VERSION } from './booking-allocation.js';

export const EARNING_DECISION_VERSION = 'PWC-FIN-07-08-2026-10-30-v1';
const identifier = value => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const reference = value => typeof value === 'string' && value.length > 0
  && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const explicitInstant = value => value instanceof Date
  || (typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value));
function blocked(code = 'EARNING_SOURCE_PENDING') {
  throw new AppError(409, code, 'Verified earning sources are required');
}

// Internal producer: callers supply identifiers only. The source adapter must read
// authoritative completion/payment/assessment records in the SAME Mongo session.
// There is intentionally no HTTP endpoint accepting these financial snapshots.
export function createEarningAccrualService({ connection, unitOfWork, sources, clock = () => new Date() }) {
  if (typeof unitOfWork?.run !== 'function' || typeof sources?.readBooking !== 'function'
    || typeof sources?.readCompletion !== 'function' || typeof sources?.guardBooking !== 'function') {
    throw new TypeError('Transactional earning source adapter is required');
  }
  const { BookingEarningSnapshot: snapshots, WeeklyBookingCounter: counters,
    CompletedBookingOrdinal: completions, EarningAccrualOutbox: outbox } = earningAccrualModels(connection);
  const { Earning: earnings, EarningLedgerEntry: ledger } = settlementModels(connection);
  const storage = createMongoSettlementRepository({ connection,
    models: { ...settlementModels(connection), ...earningAccrualModels(connection) } });

  async function recognizeCompletion({ bookingId, sitterId, session }) {
    if (!identifier(bookingId) || !identifier(sitterId)) blocked('VALIDATION_FAILED');
    const record = async transaction => {
      await storage.assertIndexesReady();
      const previous = await completions.findOne({ bookingId, sitterId }).session(transaction).lean();
      if (previous) return previous;
      const source = await sources.readCompletion({ bookingId, sitterId, session: transaction });
      const completedAt = new Date(source?.completedAt);
      if (!source || source.bookingId !== bookingId || source.sitterId !== sitterId
        || source.bookingState !== 'COMPLETED' || source.completionVerified !== true
        || !explicitInstant(source.completedAt) || !Number.isFinite(completedAt.getTime())
        || !Number.isFinite(new Date(clock()).getTime())
        || completedAt > new Date(clock()) || !reference(source.completionReference)) blocked();
      const weekKey = vietnamRequestWeek(completedAt).requestWeekKey;
      const counter = await counters.findOneAndUpdate({ sitterId, weekKey }, { $inc: { count: 1 } },
        { session: transaction, upsert: true, returnDocument: 'after', runValidators: true }).lean();
      if (!Number.isSafeInteger(counter.count) || counter.count < 1) blocked();
      const [row] = await completions.create([{ bookingId, sitterId, completedAt, weekKey,
        ordinal: counter.count, completionReference: source.completionReference }], { session: transaction });
      return row.toObject();
    };
    // The completion writer passes its transaction so ordinal assignment does
    // not wait for a later payment or tax assessment.
    return session ? record(session) : runWithRetry(record);
  }

  async function runWithRetry(work) {
    for (let attempt = 0; ; attempt++) {
      try { return await unitOfWork.run(work); }
      catch (error) {
        // MongoDB 8 does not retry a duplicate-key upsert in a transaction.
        // Re-read a concurrently committed first counter/claim in a new snapshot.
        if (error.code !== 11000 || attempt >= 3) throw error;
      }
    }
  }

  async function accrue({ bookingId, sitterId }) {
    if (!identifier(bookingId) || !identifier(sitterId)) blocked('VALIDATION_FAILED');
    return runWithRetry(async session => {
      await storage.assertIndexesReady();
      const previous = await snapshots.findOne({ bookingId, sitterId }).session(session).lean();
      // Payment/completion event redelivery must return the historical calculation.
      if (previous) return previous;
      const source = await sources.readBooking({ bookingId, sitterId, session });
      if (!source || source.bookingId !== bookingId || source.sitterId !== sitterId
        || source.bookingState !== 'COMPLETED' || source.completionVerified !== true
        || source.paymentVerified !== true || source.allocationVerified !== true
        || source.assessmentConfirmed !== true || source.currency !== 'VND'
        || !Number.isSafeInteger(source.serviceBasisVnd) || source.serviceBasisVnd < 0
        || !Number.isSafeInteger(source.confirmedTaxVnd) || source.confirmedTaxVnd < 0
        || source.confirmedTaxVnd > source.serviceBasisVnd
        || !Array.isArray(source.holdReferences)
        || source.holdReferences.some(value => !reference(value))
        || !['completionReference', 'paymentReference', 'allocationReference', 'assessmentReference', 'sourceVersion']
          .every(field => reference(source[field]))) blocked();
      if (source.holdReferences.length) blocked('EARNING_HELD');
      if (await sources.guardBooking({ bookingId, sitterId, sourceVersion: source.sourceVersion, session }) !== true) {
        blocked('EARNING_SOURCE_CHANGED');
      }
      const completedAt = new Date(source.completedAt);
      const createdAt = new Date(clock());
      if (!explicitInstant(source.completedAt) || !Number.isFinite(completedAt.getTime())
        || !Number.isFinite(createdAt.getTime()) || completedAt > createdAt) blocked();
      const claim = await completions.findOne({ sitterId, bookingId }).session(session).lean();
      if (!claim || claim.completedAt.getTime() !== completedAt.getTime()
        || claim.completionReference !== source.completionReference) blocked('COMPLETION_ORDINAL_PENDING');
      const { weekKey, ordinal } = claim;
      const feeBasisPoints = WEEKLY_COMMISSION_TIERS.filter(tier => ordinal >= tier.firstBooking).at(-1).basisPoints;
      const commissionVnd = Number((BigInt(source.serviceBasisVnd) * BigInt(feeBasisPoints) + 5000n) / 10000n);
      const split = previewEqualTaxCostSplit({ serviceBasisVnd: source.serviceBasisVnd,
        commissionVnd, confirmedTaxVnd: source.confirmedTaxVnd });
      if (source.allocationPolicyVersion !== undefined
        || source.sitterTaxCostVnd !== undefined || source.platformTaxCostVnd !== undefined) {
        if (source.allocationPolicyVersion !== BOOKING_ALLOCATION_VERSION
          || !Number.isSafeInteger(source.sitterTaxCostVnd) || source.sitterTaxCostVnd < 0
          || !Number.isSafeInteger(source.platformTaxCostVnd) || source.platformTaxCostVnd < 0
          || BigInt(source.sitterTaxCostVnd) + BigInt(source.platformTaxCostVnd) !== BigInt(source.confirmedTaxVnd)) blocked();
        split.sitterTaxCostVnd = source.sitterTaxCostVnd; split.platformTaxCostVnd = source.platformTaxCostVnd;
        split.sitterVnd = source.serviceBasisVnd - commissionVnd - source.sitterTaxCostVnd;
        split.platformVnd = commissionVnd - source.platformTaxCostVnd;
        split.requiresPlatformFunding = split.platformVnd < 0;
        if (split.sitterVnd < 0) blocked();
      }
      // A negative platform share needs an explicit funded adjustment, not an
      // implied deduction from another sitter's earnings.
      if (split.requiresPlatformFunding) blocked('PLATFORM_FUNDING_REQUIRED');
      const id = createHash('sha256').update(JSON.stringify([sitterId, bookingId])).digest('hex');
      const snapshot = { id, bookingId, sitterId, completedAt, weekKey, ordinal,
        serviceBasisVnd: source.serviceBasisVnd, feeBasisPoints, commissionVnd,
        confirmedTaxVnd: source.confirmedTaxVnd, sitterTaxCostVnd: split.sitterTaxCostVnd,
        platformTaxCostVnd: split.platformTaxCostVnd, accruedVnd: split.sitterVnd,
        policyVersion: WEEKLY_COMMISSION_VERSION, decisionVersion: EARNING_DECISION_VERSION,
        ...(source.allocationPolicyVersion ? { allocationPolicyVersion: source.allocationPolicyVersion } : {}),
        sourceVersion: source.sourceVersion,
        sourceHash: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
        completionReference: source.completionReference, paymentReference: source.paymentReference,
        allocationReference: source.allocationReference, assessmentReference: source.assessmentReference, createdAt };
      await snapshots.create([snapshot], { session });
      await earnings.create([{ earningId: id, sitterId, bookingId, completedAt,
        earningPeriodKey: weekKey, accruedVnd: split.sitterVnd, availableVnd: split.sitterVnd,
        state: 'AVAILABLE', version: 0, sourceSnapshotId: id,
        explanation: 'Completed booking; verified allocation and confirmed tax assessment',
        ledgerReference: `accrual:${id}` }], { session });
      await ledger.create([{ lineId: `accrual:${id}`, operationId: `accrual:${id}`,
        earningId: id, sitterId, toBucket: 'AVAILABLE', amountVnd: split.sitterVnd,
        policyVersion: snapshot.policyVersion, decisionVersion: snapshot.decisionVersion,
        occurredAt: createdAt }], { session });
      await outbox.create([{ eventId: `accrual:${id}`, type: 'EARNING_ACCRUED',
        snapshotId: id, state: 'PENDING', createdAt }], { session });
      return snapshots.findOne({ id }).session(session).lean();
    });
  }
  return Object.freeze({ recognizeCompletion, accrue });
}
