import { Types } from 'mongoose';
import { carePlanInput } from '../../validators/booking-care-plan.validator.js';
import { fail, id, digest } from '../../validators/pet-care.validator.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { boardingCarePlan } from './boarding-care-plan.service.js';
import { CHECKOUT_POLICY_VERSION } from './checkout-snapshot.service.js';

const oid = value => new Types.ObjectId(value);
const publicShift = row => ({ sequence: row.sequence, startAt: row.startAt, endAt: row.endAt,
  serviceName: row.snapshots.serviceName, serviceNetVnd: row.snapshots.employeeServiceNetVnd, customerVisitId: row.customerVisitId });
export function createBookingCarePlanService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name), uow = createUnitOfWork(connection);
  const { FinanceSourceCommand: commands, FinanceSourceEvent: events } = financeSourceModels(connection);
  const systemActor = Object.freeze({ userId: 'SYSTEM_DISPATCH' });
  function staff(actor) {
    if (actor?.state !== 'ACTIVE' || actor.synthetic === true) fail('UNAUTHENTICATED', 'Authentication required', 401);
    id(actor.userId); if (!actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
  }
  async function context(bookingId, expectedVersion, session) {
    const booking = await col('bookings').findOne({ _id: oid(bookingId), 'checkoutSnapshot.policyVersion': CHECKOUT_POLICY_VERSION }, { session });
    if (!booking) fail('RESOURCE_NOT_FOUND', 'Checkout booking unavailable', 404);
    if (booking.version !== expectedVersion) fail('VERSION_CONFLICT', 'Booking changed', 409);
    if (booking.carePlanState !== 'NEEDS_REVIEW' || !['AWAITING_PAYMENT', 'DISPATCH_PENDING'].includes(booking.state)) fail('INVALID_STATE', 'Care plan already decided', 409);
    return booking;
  }
  const service = {
    async runBatch({ limit = 10 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail('VALIDATION_FAILED', 'Invalid care plan batch limit');
      await assertFinanceSourceStorage(connection);
      const rows = await col('bookings').find({ carePlanState: 'NEEDS_REVIEW',
        'checkoutSnapshot.policyVersion': CHECKOUT_POLICY_VERSION, state: { $in: ['AWAITING_PAYMENT', 'DISPATCH_PENDING'] },
        'checkoutSnapshot.customerVisits.startAt': { $gt: new Date(clock()) } }).sort({ createdAt: 1, _id: 1 }).limit(limit).maxTimeMS(5000).toArray();
      for (const row of rows) {
        try { await service.finalize(systemActor, String(row._id), { expectedVersion: row.version, shiftMinutes: 480 }, `system-plan:${row._id}`); }
        catch (error) { if (!['VERSION_CONFLICT', 'INVALID_STATE', 'CARE_PLAN_REVIEW_REQUIRED'].includes(error.code)) throw error; }
      }
    },
    async list(actor) {
      staff(actor); await assertFinanceSourceStorage(connection);
      const records = await col('bookings').find({ carePlanState: 'NEEDS_REVIEW' }).sort({ createdAt: 1, _id: 1 }).limit(20).maxTimeMS(5000).toArray();
      return { items: records.map(row => ({ id: String(row._id), version: row.version, paymentMode: row.paymentMode, paymentState: row.paymentState,
        createdAt: row.createdAt, customerVisitCount: row.originalVisitCount })) };
    },
    async preview(actor, bookingId, body) {
      staff(actor); id(bookingId); const input = carePlanInput(body); await assertFinanceSourceStorage(connection);
      const booking = await context(bookingId, input.expectedVersion);
      return { bookingId, version: booking.version, shifts: boardingCarePlan(booking, input.shiftMinutes).map(publicShift) };
    },
    async finalize(actor, bookingId, body, key) {
      if (actor !== systemActor) staff(actor);
      id(bookingId); const input = carePlanInput(body);
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Idempotency key required');
      await assertFinanceSourceStorage(connection);
      const commandId = digest([actor.userId, 'CARE_PLAN_FINALIZE', bookingId, key]), fingerprint = digest(input);
      for (let attempt = 0; ; attempt++) {
        try { return await uow.run(async session => {
          const prior = await commands.findById(commandId).session(session).lean();
          if (prior) { if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_REUSED', 'Care plan key reused', 409); return prior.result; }
          const booking = await context(bookingId, input.expectedVersion, session), shifts = boardingCarePlan(booking, input.shiftMinutes);
          if (shifts.some(row => row.startAt <= new Date(clock()))) fail('INVALID_STATE', 'Cannot finalize past shifts', 409);
          const at = new Date(clock()), visits = shifts.map(row => ({ ...row, _id: new Types.ObjectId(), bookingId: booking._id,
            customerId: booking.customerId, requestedSitterId: row.requestedSitterId ?? null, areaCode: row.areaCode,
            sitterId: null, state: 'SCHEDULED', version: 0, evidenceRefs: [] }));
          const changed = await col('bookings').updateOne({ _id: booking._id, version: booking.version, carePlanState: 'NEEDS_REVIEW' },
            { $set: { carePlanState: 'APPROVED', careVisitCount: visits.length, visitIds: visits.map(row => row._id),
              carePlanSnapshot: { shiftMinutes: input.shiftMinutes, approvedBy: actor.userId, approvedAt: at, allocationVersion: 'PWC-BOARDING-SHIFT-2026-10-30-v1' } },
              $inc: { version: 1, financeGuardVersion: 1 } }, { session });
          if (!changed.matchedCount) fail('VERSION_CONFLICT', 'Care plan changed', 409);
          const superseded = await col('visits').updateMany({ _id: { $in: booking.visitIds }, state: 'SCHEDULED', version: 0 },
            { $set: { state: 'SUPERSEDED', supersededAt: at }, $inc: { version: 1 } }, { session });
          if (superseded.matchedCount !== booking.visitIds.length) fail('VERSION_CONFLICT', 'Existing visits changed', 409);
          await col('visits').insertMany(visits, { session });
          const result = { bookingId, version: booking.version + 1, state: booking.state, visits: visits.map(row => ({ id: String(row._id), ...publicShift(row), state: 'SCHEDULED' })) };
          await commands.create([{ _id: commandId, fingerprint, result, createdAt: at }], { session });
          await events.create([{ _id: `care-plan:${bookingId}`, type: 'CarePlanFinalized', bookingId, actorId: actor.userId, resourceId: bookingId, at }], { session });
          return result;
        }); } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
      }
    }
  };
  return service;
}
