
import { Types } from 'mongoose';
import { VISIT_WITHDRAWAL_REASONS } from '../../constants/visit-withdrawal.js';
import { fail } from '../../validators/pet-care.validator.js';

const EARLY_WINDOW_MS = 12 * 60 * 60 * 1000;
const oid = value => new Types.ObjectId(value);

export function hasPendingWithdrawal(visit) {
  const request = visit.withdrawalRequest;
  return !!request && String(request.sitterId) === String(visit.sitterId) &&
    (request.assignedAt?.getTime() ?? null) === (visit.assignedAt?.getTime() ?? null);
}

export function createVisitWithdrawalService({ repository, clock, runCommand, requeue }) {
  const { col, models, employeeGuard } = repository;
  const visits = col('visits');
  function optionsFor(visit, now) {
    return { visitId: String(visit._id), startAt: visit.startAt, version: visit.version,
      mode: visit.startAt.getTime() - now >= EARLY_WINDOW_MS ? 'EARLY' : 'LATE',
      serverNow: new Date(now), reasonCodes: VISIT_WITHDRAWAL_REASONS };
  }

  async function assignedVisit(actor, visitId, session) {
    if (actor.state !== 'ACTIVE' || actor.synthetic) fail('FORBIDDEN', 'Active pet sitter required', 403);
    const visit = await visits.findOne({ _id: oid(visitId), sitterId: oid(actor.userId) }, { session });
    if (!visit) fail('RESOURCE_NOT_FOUND', 'Assigned visit unavailable', 404);
    if (visit.state !== 'ASSIGNED' || visit.checkInAt) fail('INVALID_STATE', 'Visit must be accepted and not checked in', 409);
    if (hasPendingWithdrawal(visit)) fail('WITHDRAWAL_ALREADY_REQUESTED', 'A withdrawal request already exists', 409);
    return visit;
  }

  return {
    async options(actor, visitId) {
      return optionsFor(await assignedVisit(actor, visitId), clock());
    },

    async submit(actor, visitId, input, key) {
      const result = await runCommand(actor, { visitId, ...input }, key, async session => {
        await employeeGuard(actor.userId, session, actor.authEpoch);
        const visit = await assignedVisit(actor, visitId, session);
        if (visit.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Visit changed', 409);
        const { mode, serverNow: at } = optionsFor(visit, clock());
        if (mode !== input.expectedMode) fail('WITHDRAWAL_MODE_CHANGED', 'Withdrawal mode changed', 409);
        const { reasonCode, note } = input;
        const details = { reasonCode, ...(note ? { note } : {}) };
        const early = mode === 'EARLY';
        const updated = await visits.updateOne({
          _id: visit._id, sitterId: visit.sitterId, version: visit.version, state: 'ASSIGNED', checkInAt: null
        }, early ? {
          $set: { state: 'SCHEDULED', sitterId: null, handoverRequired: true, handoverAccepted: false,
            withdrawalDispatch: { sitterId: visit.sitterId } },
          $unset: { assignedAt: 1, assignedFeatureSnapshot: 1, careAcknowledgement: 1, handoverAcceptedAt: 1,
            withdrawalRequest: 1, dispatchReview: 1 },
          $inc: { version: 1 }
        } : {
          $set: { withdrawalRequest: { ...details, sitterId: visit.sitterId, assignedAt: visit.assignedAt ?? null, at } },
          $inc: { version: 1 }
        }, { session });
        if (!updated.matchedCount) fail('VERSION_CONFLICT', 'Visit changed', 409);

        if (early) {
          const bookings = col('bookings');
          await bookings.updateOne({ _id: visit.bookingId }, { $inc: { version: 1, financeGuardVersion: 1 } }, { session });
          await bookings.updateOne({ _id: visit.bookingId, state: 'ASSIGNED' }, { $set: { state: 'DISPATCH_PENDING' } }, { session });
          await models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING' },
            { $set: { state: 'REVOKED', decidedAt: at }, $inc: { version: 1 } }, { session });
        }
        await models.EmployeeScheduleEvent.create([{
          type: early ? 'VisitWithdrawn' : 'VisitWithdrawalRequested', actorId: actor.userId,
          sitterId: actor.userId, visitId, at, detail: details
        }], { session });
        return { visitId, mode, startAt: visit.startAt, version: visit.version + 1 };
      });

      if (result.mode === 'EARLY') await requeue?.(visitId, result.version);
      return result;
    },

    async staffRequests() {
      const rows = await visits.find({ state: 'ASSIGNED', checkInAt: null, 'withdrawalRequest.sitterId': { $exists: true },
        $expr: { $and: [
          { $eq: ['$sitterId', '$withdrawalRequest.sitterId'] },
          { $eq: [{ $ifNull: ['$assignedAt', null] }, '$withdrawalRequest.assignedAt'] }
        ] }
      }, { projection: { sitterId: 1, startAt: 1, 'snapshots.serviceName': 1, withdrawalRequest: 1 } })
        .sort({ startAt: 1, _id: 1 }).limit(51).maxTimeMS(5000).toArray();
      const sitters = await col('users').find({ _id: { $in: rows.map(row => row.sitterId) } },
        { projection: { displayName: 1 } }).toArray();
      const names = new Map(sitters.map(row => [String(row._id), row.displayName]));
      return { withdrawalRequestsHaveMore: rows.length > 50, withdrawalRequests: rows.slice(0, 50).map(row => ({
        id: String(row._id), sitterId: String(row.sitterId), sitterName: names.get(String(row.sitterId)) ?? null,
        startAt: row.startAt, serviceName: row.snapshots?.serviceName, reasonCode: row.withdrawalRequest.reasonCode,
        note: row.withdrawalRequest.note, requestedAt: row.withdrawalRequest.at
      })) };
    }
  };
}
