import { Types } from 'mongoose';
import { payrollModels } from '../../models/payroll.model.js';
import { fail, id, digest } from '../../validators/pet-care.validator.js';
import { schedulingKey } from '../../validators/employee-scheduling.validator.js';
import { withdrawalReviewInput } from '../../validators/withdrawal-review.validator.js';
import { hasPendingWithdrawal } from './visit-withdrawal.service.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const oid = value => new Types.ObjectId(value);
const staffOnly = actor => {
  if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
};
export function createWithdrawalReviewService({ repository, clock = Date.now, requeue }) {
  const { col, models, uow } = repository;
  const { PayrollMonthGuard } = payrollModels(models.EmployeeVisitOffer.db);
  const notifications = createSchedulingNotifications({ col, clock });
  async function read(visitId, session) {
    const row = await col('visits').findOne({ _id: oid(id(visitId)) }, { session, maxTimeMS: 5000 });
    if (!row) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    if (row.state !== 'ASSIGNED' || row.checkInAt || !hasPendingWithdrawal(row)) fail('INVALID_STATE', 'Withdrawal no longer pending', 409);
    return row;
  }
  return {
    async details(actor, visitId) {
      staffOnly(actor);
      const row = await read(visitId), sitter = await col('users').findOne({ _id: row.sitterId }, { projection: { displayName: 1 }, maxTimeMS: 2000 });
      return { visitId, version: row.version, serviceName: row.snapshots?.serviceName ?? null, startAt: row.startAt, endAt: row.endAt,
        sitterName: sitter?.displayName ?? null, reasonCode: row.withdrawalRequest.reasonCode, note: row.withdrawalRequest.note ?? null };
    },
    async decide(actor, visitId, body, key) {
      staffOnly(actor); id(visitId); schedulingKey(key);
      const input = withdrawalReviewInput(body), commandId = digest([actor.userId, 'withdrawal-review', key]), fingerprint = digest({ visitId, ...input });
      let result;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await uow.run(async session => {
            const current = await col('users').findOneAndUpdate({ _id: oid(actor.userId), state: 'ACTIVE', synthetic: { $ne: true },
              roles: { $in: ['STAFF', 'ADMIN'] }, ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) },
            { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
            if (!current) fail('FORBIDDEN', 'Current account cannot review withdrawals', 403);
            const previous = await models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
            if (previous) {
              if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key reused', 409);
              return previous.result;
            }
            const row = await read(visitId, session);
            if (row.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Visit changed', 409);
            // A release must also work for a suspended employee. Serialize with assignment/calendar
            // writers without treating the administrative release as a new eligibility grant.
            const sitterId = String(row.sitterId);
            await PayrollMonthGuard.findOneAndUpdate({ _id: `employee:${sitterId}` }, { $inc: { version: 1 } }, { upsert: true, session });
            await col('users').updateOne({ _id: row.sitterId }, { $inc: { schedulingGuardVersion: 1 } }, { session });
            await col('sitterstatuses').updateOne({ userId: row.sitterId }, { $inc: { schedulingGuardVersion: 1 } }, { session });
            const at = new Date(clock()), release = input.decision === 'RELEASE';
            const saved = await col('visits').findOneAndUpdate({ _id: row._id, version: row.version, state: 'ASSIGNED', checkInAt: null }, {
              $set: { withdrawalDecision: { decision: input.decision, reason: input.reason, at, byUserId: actor.userId },
                ...(release ? { state: 'SCHEDULED', sitterId: null, handoverRequired: true, handoverAccepted: false,
                  withdrawalDispatch: { sitterId: row.sitterId } } : {}) },
              $unset: { withdrawalRequest: '', ...(release ? { assignedAt: '', assignedFeatureSnapshot: '', careAcknowledgement: '', handoverAcceptedAt: '', dispatchReview: '' } : {}) },
              $inc: { version: 1 }
            }, { session, returnDocument: 'after' });
            if (!saved) fail('VERSION_CONFLICT', 'Visit changed', 409);
            if (release) {
              await col('bookings').updateOne({ _id: row.bookingId }, { $inc: { version: 1, financeGuardVersion: 1 } }, { session });
              await col('bookings').updateOne({ _id: row.bookingId, state: 'ASSIGNED' }, { $set: { state: 'DISPATCH_PENDING' } }, { session });
              await models.EmployeeVisitOffer.updateMany({ visitId: row._id, state: 'PENDING' },
                { $set: { state: 'REVOKED', decidedAt: at }, $inc: { version: 1 } }, { session });
            }
            const event = { type: release ? 'VisitWithdrawalApproved' : 'VisitWithdrawalRejected', actorId: actor.userId,
              sitterId, visitId, at, detail: { version: saved.version, reason: input.reason } };
            await models.EmployeeScheduleEvent.create([event], { session });
            await notifications.publish(event, session);
            const response = { visitId, version: saved.version, decision: input.decision, state: saved.state };
            await models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint, result: response, createdAt: at }], { session });
            return response;
          });
          break;
        } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
      }
      if (result.decision === 'RELEASE') await requeue?.(visitId, result.version);
      return result;
    }
  };
}
