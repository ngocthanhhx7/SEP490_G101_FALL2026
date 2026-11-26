
import { flagVisitHandover } from '../care/visit-handover-policy.service.js';
import { Types } from 'mongoose';
import { VISIT_WITHDRAWAL_REASONS } from '../../constants/visit-withdrawal.js';
import { employeeSchedulingModels } from '../../models/employee-scheduling.model.js';
import { fail } from '../../validators/pet-care.validator.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const EARLY_WINDOW_MS = 12 * 60 * 60 * 1000;
const STAFF_REVIEW_REQUIRED = 'STAFF_REVIEW_REQUIRED';
const oid = value => new Types.ObjectId(value);

export function hasPendingWithdrawal(visit) {
  const request = visit.withdrawalRequest;
  return !!request && String(request.sitterId) === String(visit.sitterId) &&
    (request.assignedAt?.getTime() ?? null) === (visit.assignedAt?.getTime() ?? null);
}

async function publishDispatchReviewRequired({ events, notifications, actorId, visitId, version, at, session }) {
  const type = 'DispatchReviewRequired';
  const detail = { code: STAFF_REVIEW_REQUIRED, version };
  await events.create([{ type, actorId: String(actorId), visitId, at, detail }], { session });
  await notifications.publish({ type, visitId, detail }, session);
}

// Shared release path used by both early sitter withdrawal and Admin sitter suspension (UC-19, GBR-04).
// Returns the next visit version when released so callers can re-offer via dispatch.requeueWithdrawal.
export async function releaseAssignedVisitForHandover({
  visits, bookings, offers, events, notifications, visit, actorId, at, reasonCode, detail, session, needsStaffReview = false
}) {
  const previousSitterId = visit.sitterId;
  const handover = flagVisitHandover(previousSitterId, at, { reasonCode });
  const setFields = {
    state: 'SCHEDULED',
    sitterId: null,
    ...handover.set,
    withdrawalDispatch: { sitterId: previousSitterId },
    ...(needsStaffReview ? { dispatchReview: { code: STAFF_REVIEW_REQUIRED, at } } : {})
  };
  const unsetFields = {
    assignedAt: 1,
    assignedFeatureSnapshot: 1,
    ...handover.unset,
    withdrawalRequest: 1,
    ...(needsStaffReview ? {} : { dispatchReview: 1 })
  };
  const updated = await visits.updateOne({
    _id: visit._id, sitterId: previousSitterId, version: visit.version, state: 'ASSIGNED', checkInAt: null
  }, {
    $set: setFields,
    $unset: unsetFields,
    $inc: { version: 1 }
  }, { session });
  if (!updated.matchedCount) return null;

  await bookings.updateOne({ _id: visit.bookingId }, { $inc: { version: 1, financeGuardVersion: 1 } }, { session });
  await bookings.updateOne({ _id: visit.bookingId, state: 'ASSIGNED' }, { $set: { state: 'DISPATCH_PENDING' } }, { session });
  const pendingForVisit = await offers.find({ visitId: visit._id, state: 'PENDING' }).select('_id').session(session).lean();
  if (pendingForVisit.length) {
    await offers.updateMany({ _id: { $in: pendingForVisit.map(row => row._id) }, state: 'PENDING' },
      { $set: { state: 'REVOKED', decidedAt: at }, $inc: { version: 1 } }, { session });
  }
  const visitId = String(visit._id);
  const nextVersion = (visit.version ?? 0) + 1;
  await events.create([{
    type: 'VisitWithdrawn', actorId: String(actorId),
    sitterId: String(previousSitterId), visitId, at, detail
  }], { session });
  await notifications.publish({ type: 'VisitWithdrawn',
    sitterId: String(previousSitterId), visitId, detail: { version: nextVersion } }, session);
  if (needsStaffReview) {
    await publishDispatchReviewRequired({ events, notifications, actorId, visitId, version: nextVersion, at, session });
  }
  return { visitId, version: nextVersion };
}

// Called inside Admin's SUSPEND transaction (UC-19, GBR-04):
// 1. Withdraw all PENDING offers for the suspended sitter (state -> REVOKED).
// 2. Recover SCHEDULED visits that lost their last pending offer.
// 3. Release all ASSIGNED visits that have not started (checkInAt: null) with handover flag so they are re-offered
//    (or flagged for Staff Needs Action when automatic dispatch is off).
// 4. Leave IN_PROGRESS visits untouched so the pet sitter finishes them first.
export async function releaseSuspendedSitterWork({ connection, sitterId, actorId, reason, at, session, autoRequeue = true }) {
  const sitterIdStr = String(sitterId);
  const sitterOid = oid(sitterIdStr);
  if (typeof connection?.model !== 'function') {
    const visitsCol = connection?.db?.collection?.('visits');
    if (typeof visitsCol?.updateMany === 'function') {
      const handover = flagVisitHandover(sitterOid, at, { reasonCode: 'SITTER_SUSPENDED' });
      await visitsCol.updateMany(
        { sitterId: sitterOid, state: 'ASSIGNED', checkInAt: null },
        { $set: { state: 'SCHEDULED', sitterId: null, ...handover.set }, $inc: { version: 1 } },
        { session }
      );
    }
    return { withdrawnOfferCount: 0, requeueTargets: [] };
  }
  const models = employeeSchedulingModels(connection);
  const col = name => connection.db.collection(name);
  const notifications = createSchedulingNotifications({ col, clock: () => at.getTime() });
  const { EmployeeVisitOffer: offers, EmployeeScheduleEvent: events } = models;

  const pendingOffers = await offers.find({ sitterId: sitterIdStr, state: 'PENDING' })
    .select('_id visitId').session(session).lean();
  const affectedVisitIds = new Set(pendingOffers.filter(row => row.visitId).map(row => String(row.visitId)));
  let withdrawnOfferCount = 0;
  if (pendingOffers.length) {
    const res = await offers.updateMany(
      { _id: { $in: pendingOffers.map(row => row._id) }, state: 'PENDING' },
      { $set: { state: 'REVOKED', decidedAt: at }, $inc: { version: 1 } },
      { session }
    );
    withdrawnOfferCount = res.modifiedCount ?? pendingOffers.length;
  }

  const visits = col('visits');
  const requeueTargets = [];
  for (const visitId of [...affectedVisitIds].sort()) {
    const filter = { _id: oid(visitId), state: 'SCHEDULED', sitterId: null };
    // Take a write lock before counting other offers so concurrent suspensions cannot
    // each see the other's offer. Remove the lock field in this same transaction.
    const visit = await visits.findOneAndUpdate(filter, { $set: { suspensionOfferCheck: true } }, {
      session, projection: { version: 1 }
    });
    if (!visit) continue;
    const otherOffer = await offers.exists({ visitId: visit._id, state: 'PENDING' }).session(session);
    const clearLock = { $unset: { suspensionOfferCheck: 1 } };
    if (otherOffer) {
      await visits.updateOne(filter, clearLock, { session });
      continue;
    }
    await visits.updateOne(filter, {
      ...clearLock,
      $inc: { version: 1 },
      ...(autoRequeue ? {} : { $set: { dispatchReview: { code: STAFF_REVIEW_REQUIRED, at } } })
    }, { session });
    const version = (visit.version ?? 0) + 1;
    if (!autoRequeue) {
      await publishDispatchReviewRequired({ events, notifications, actorId, visitId, version, at, session });
    }
    requeueTargets.push({ visitId, version, afterOfferRevocation: true });
  }

  const bookings = col('bookings');
  const assignedVisits = await visits.find({
    sitterId: sitterOid,
    state: 'ASSIGNED',
    checkInAt: null
  }, { session }).sort({ startAt: 1, _id: 1 }).toArray();

  for (const visit of assignedVisits) {
    const released = await releaseAssignedVisitForHandover({
      visits,
      bookings,
      offers,
      events,
      notifications,
      visit,
      actorId,
      at,
      reasonCode: 'SITTER_SUSPENDED',
      detail: { reasonCode: 'SITTER_SUSPENDED', ...(reason ? { note: reason } : {}) },
      session,
      needsStaffReview: !autoRequeue
    });
    if (released) requeueTargets.push(released);
  }
  return { withdrawnOfferCount, requeueTargets };
}

export function createVisitWithdrawalService({ repository, clock, runCommand, requeue }) {
  const { col, models, employeeGuard } = repository;
  const notifications = createSchedulingNotifications({ col, clock });
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
        if (early) {
          const released = await releaseAssignedVisitForHandover({
            visits,
            bookings: col('bookings'),
            offers: models.EmployeeVisitOffer,
            events: models.EmployeeScheduleEvent,
            notifications,
            visit,
            actorId: actor.userId,
            at,
            reasonCode,
            detail: details,
            session
          });
          if (!released) fail('VERSION_CONFLICT', 'Visit changed', 409);
          return { visitId, mode, startAt: visit.startAt, version: released.version };
        }
        const updated = await visits.updateOne({
          _id: visit._id, sitterId: visit.sitterId, version: visit.version, state: 'ASSIGNED', checkInAt: null
        }, {
          $set: { withdrawalRequest: { ...details, sitterId: visit.sitterId, assignedAt: visit.assignedAt ?? null, at } },
          $inc: { version: 1 }
        }, { session });
        if (!updated.matchedCount) fail('VERSION_CONFLICT', 'Visit changed', 409);
        await models.EmployeeScheduleEvent.create([{
          type: 'VisitWithdrawalRequested', actorId: actor.userId,
          sitterId: actor.userId, visitId, at, detail: details
        }], { session });
        await notifications.publish({ type: 'VisitWithdrawalRequested',
          sitterId: actor.userId, visitId, detail: { version: visit.version + 1 } }, session);
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
