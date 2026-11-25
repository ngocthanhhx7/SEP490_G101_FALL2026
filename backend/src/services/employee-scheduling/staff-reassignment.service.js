import { Types } from 'mongoose';
import { payrollModels } from '../../models/payroll.model.js';
import { AppError } from '../../utils/app-error.js';
import { fail, id } from '../../validators/pet-care.validator.js';
import { schedulingKey, reassignmentInput } from '../../validators/employee-scheduling.validator.js';
import { flagVisitHandover, urgentReplacement } from '../care/visit-handover-policy.service.js';
import { reasonsOfVisit } from './needs-action.service.js';
import { hasPendingWithdrawal } from './visit-withdrawal.service.js';

const oid = value => new Types.ObjectId(value);
const staffOnly = actor => {
  if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
};
// UC-38: staff replace the pet sitter of an accepted visit that has not been checked in and has not ended.
const reassignable = (visit, now) => visit?.state === 'ASSIGNED' && !!visit.sitterId && !visit.checkInAt && visit.endAt > now;

export function createStaffReassignmentService({ repository, clock = Date.now, candidates, event, runCommand }) {
  const { col, models, employeeGuard, eligible, registrationContract } = repository;
  const { PayrollMonthGuard } = payrollModels(models.EmployeeVisitOffer.db);

  async function names(ids) {
    const rows = ids.length ? await col('users').find({ _id: { $in: ids.map(oid) } }, { projection: { displayName: 1 }, maxTimeMS: 2000 }).toArray() : [];
    return new Map(rows.map(row => [String(row._id), row.displayName ?? null]));
  }
  const employmentType = async sitterId => (await registrationContract(sitterId, null, false).catch(() => null))?.employmentType ?? null;

  async function readVisit(visitId, session) {
    const visit = await col('visits').findOne({ _id: oid(id(visitId)) }, { session, maxTimeMS: 5000 });
    if (!visit) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    return visit;
  }
  // The visit changed while staff were choosing: report the current holder so the page can reload.
  async function changed(visitId, session) {
    const latest = await col('visits').findOne({ _id: oid(visitId) }, { session, projection: { sitterId: 1, state: 1, version: 1 } });
    const holder = latest?.sitterId ? (await names([String(latest.sitterId)])).get(String(latest.sitterId)) ?? null : null;
    return new AppError(409, 'REASSIGN_VISIT_CHANGED', 'Visit changed', { sitterName: holder, state: latest?.state ?? null, version: latest?.version ?? null });
  }
  async function withdrewBefore(visit) {
    return new Set(await models.EmployeeScheduleEvent.distinct('sitterId', { visitId: String(visit._id), type: { $in: ['VisitWithdrawn', 'VisitWithdrawalApproved'] } }));
  }

  return {
    async details(actor, visitId) {
      staffOnly(actor);
      const visit = await readVisit(visitId), now = clock();
      if (!reassignable(visit, new Date(now))) fail('VISIT_NOT_REASSIGNABLE', 'This visit can no longer change pet sitter', 409);
      const held = String(visit.sitterId);
      const [{ sitterIds, blocked, weeklyMinutes }, withdrew, booking] = await Promise.all([
        candidates(visit, { manual: true, explain: true, alternatives: true, allowStarted: true }),
        withdrewBefore(visit), col('bookings').findOne({ _id: visit.bookingId }, { projection: { bookingCode: 1, code: 1 } })
      ]);
      const open = sitterId => sitterId !== held && !withdrew.has(sitterId);
      const items = sitterIds.filter(open), refused = blocked.filter(row => open(row.sitterId));
      const people = await names([held, String(visit.customerId), ...items, ...refused.map(row => row.sitterId)]);
      const contracts = new Map(await Promise.all([held, ...items, ...refused.map(row => row.sitterId)].map(async sitterId => [sitterId, await employmentType(sitterId)])));
      return {
        visit: { id: String(visit._id), version: visit.version, bookingId: String(visit.bookingId), bookingCode: booking?.bookingCode ?? booking?.code ?? null,
          serviceName: visit.snapshots?.serviceName ?? null, startAt: visit.startAt, endAt: visit.endAt,
          pets: (visit.snapshots?.pets ?? []).map(pet => ({ name: pet.name ?? null, species: pet.species ?? null })).slice(0, 10),
          customerName: people.get(String(visit.customerId)) ?? null, address: visit.snapshots?.serviceAddress ?? null,
          reasons: reasonsOfVisit(visit, now), withdrawalPending: hasPendingWithdrawal(visit), handoverPending: visit.handoverRequired === true && visit.handoverAccepted !== true },
        currentSitter: { id: held, displayName: people.get(held) ?? null, employmentType: contracts.get(held), assignedAt: visit.assignedAt ?? null },
        items: items.map(sitterId => ({ sitterId, displayName: people.get(sitterId) ?? null, employmentType: contracts.get(sitterId),
          weeklyMinutes: weeklyMinutes?.[sitterId] ?? null })),
        blocked: refused.map(row => ({ sitterId: row.sitterId, displayName: people.get(row.sitterId) ?? null, employmentType: contracts.get(row.sitterId), reason: row.reason }))
      };
    },

    async reassign(actor, visitId, body, key) {
      staffOnly(actor); id(visitId); schedulingKey(key);
      const input = reassignmentInput(body);
      return runCommand(actor, { visitId, ...input }, key, async session => {
        const visit = await readVisit(visitId, session), at = new Date(clock());
        if (!reassignable(visit, at) || visit.version !== input.expectedVersion) throw await changed(visitId, session);
        const previousSitterId = visit.sitterId;
        if (String(previousSitterId) === input.sitterId) throw await changed(visitId, session);
        const target = (await names([input.sitterId])).get(input.sitterId) ?? null;
        const refuse = reason => new AppError(409, 'REASSIGN_SITTER_NOT_ELIGIBLE', 'Chosen pet sitter cannot take this visit', { sitterName: target, reasonCode: reason });
        if ((await withdrewBefore(visit)).has(input.sitterId)) throw refuse('SITTER_WITHDREW');
        // Serialise with the former holder's own changes (withdrawal review, calendar edits) as well as the new one's.
        await PayrollMonthGuard.findOneAndUpdate({ _id: `employee:${String(previousSitterId)}` }, { $inc: { version: 1 } }, { upsert: true, session });
        await col('users').updateOne({ _id: previousSitterId }, { $inc: { schedulingGuardVersion: 1 } }, { session });
        await col('sitterstatuses').updateOne({ userId: previousSitterId }, { $inc: { schedulingGuardVersion: 1 } }, { session });
        try {
          await employeeGuard(input.sitterId, session);
          await eligible(input.sitterId, visit, session, { requireOrigin: false, allowStarted: true });
        } catch (error) {
          if (error.status !== 409) throw error;
          if (error.code === 'SLOT_UNAVAILABLE') throw new AppError(409, 'REASSIGN_SITTER_BUSY', 'Chosen pet sitter has another visit at this time', { sitterName: target });
          throw refuse(error.code);
        }
        // The new holder confirms the handover like any replacement; the late check-in exemption follows the offer rule.
        const handover = flagVisitHandover(previousSitterId, at, { reasonText: input.reason });
        const exempt = urgentReplacement({ handoverRequired: true }, at, visit.startAt);
        const hadWithdrawal = hasPendingWithdrawal(visit);
        const saved = await col('visits').findOneAndUpdate({ _id: visit._id, version: visit.version, state: 'ASSIGNED', sitterId: previousSitterId, checkInAt: null }, {
          $set: { sitterId: oid(input.sitterId), assignedAt: at, ...handover.set, handoverLateCheckInExempt: exempt,
            // The customer's nomination named the former sitter; keep it in the record instead of steering later dispatch back to that person.
            requestedSitterId: null,
            staffReassignment: { at, byUserId: actor.userId, fromSitterId: previousSitterId, toSitterId: oid(input.sitterId), reason: input.reason,
              ...(visit.requestedSitterId ? { customerRequestedSitterId: visit.requestedSitterId } : {}),
              ...(hadWithdrawal ? { withdrawalReasonCode: visit.withdrawalRequest.reasonCode } : {}) },
            ...(hadWithdrawal ? { withdrawalDecision: { decision: 'REASSIGN', reason: input.reason, at, byUserId: actor.userId } } : {}) },
          $unset: { ...Object.fromEntries(Object.keys(handover.unset).filter(key => key !== 'handoverLateCheckInExempt').map(key => [key, 1])),
            withdrawalRequest: 1, withdrawalDispatch: 1, assignedFeatureSnapshot: 1, dispatchReview: 1, dispatchPreferredFallback: 1 },
          $inc: { version: 1 }
        }, { session, returnDocument: 'after' });
        if (!saved) throw await changed(visitId, session);
        await col('bookings').updateOne({ _id: visit.bookingId }, { $inc: { version: 1, financeGuardVersion: 1 } }, { session });
        await models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING' }, { $set: { state: 'REVOKED', decidedAt: at }, $inc: { version: 1 } }, { session });
        await event({ type: 'VisitReassigned', actorId: actor.userId, sitterId: input.sitterId, visitId,
          detail: { version: saved.version, previousSitterId: String(previousSitterId), reason: input.reason, lateCheckInExempt: exempt } }, session);
        await event({ type: 'VisitHandoverRequired', actorId: actor.userId, sitterId: input.sitterId, visitId, detail: { version: saved.version } }, session);
        return { visitId, version: saved.version, state: saved.state, sitterId: input.sitterId, sitterName: target, startAt: saved.startAt, handoverLateCheckInExempt: exempt };
      });
    }
  };
}
