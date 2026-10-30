import { Types } from 'mongoose';
import { createSitterOfferService } from '../sitter-offer.service.js';
import { fail, id, digest } from '../../validators/pet-care.validator.js';
import { invitationInput, schedulingKey } from '../../validators/employee-scheduling.validator.js';
import { assertEmployeeSchedulingStorage } from './scheduling-storage.service.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const oid = value => new Types.ObjectId(value);
const offerView = row => row && ({ ...row, id: String(row._id), visitId: String(row.visitId), sitterId: row.sitterId });
export function createEmployeeDispatchService({ repository, clock = Date.now, ranker }) {
  const { models, col, uow, employeeGuard, eligible } = repository;
  const notifications = createSchedulingNotifications({ col, clock });
  const agentActor = Object.freeze({ userId: 'SYSTEM_DISPATCH', roles: ['SYSTEM'], state: 'ACTIVE' });
  async function command(actor, operation, payload, key, execute) {
    schedulingKey(key); await assertEmployeeSchedulingStorage(models.EmployeeVisitOffer.db);
    const commandId = digest([actor.userId, operation, key]), fingerprint = digest(payload);
    for (let attempt = 0; ; attempt++) {
      try { return await uow.run(async session => {
        const user = actor === agentActor ? null : await col('users').findOneAndUpdate({ _id: oid(actor.userId), state: 'ACTIVE', synthetic: { $ne: true },
          ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
        const needed = operation === 'invite' ? ['STAFF', 'ADMIN'] : ['PET_SITTER'];
        if (actor !== agentActor && (!user || !needed.some(role => user.roles.includes(role)))) fail('FORBIDDEN', 'Current account cannot perform this operation', 403);
        const previous = await models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
        if (previous) { if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key reused', 409); return previous.result; }
        const result = await execute(session);
        await models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint, result, createdAt: new Date(clock()) }], { session });
        return result;
      }); } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  async function readyVisit(visitId, session) {
    const visit = await col('visits').findOne({ _id: oid(visitId) }, { session });
    if (!visit) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    const booking = await col('bookings').findOne({ _id: visit.bookingId }, { session });
    if (!booking || booking.carePlanState !== 'APPROVED' || !['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(booking.state) || visit.state !== 'SCHEDULED' || visit.sitterId)
      fail('VISIT_UNAVAILABLE', 'Care plan must be finalized before sending invitations', 409);
    if (booking.paymentMode === 'PREPAY') {
      const receipt = await col('payments').findOne({ bookingId: booking._id, state: 'VERIFIED' }, { session });
      if (booking.paymentState !== 'PAID' || receipt?.receiptMoney?.currency !== 'VND' || receipt.receiptMoney.amountVnd !== booking.paymentSnapshot.amountVnd)
        fail('PAYMENT_REQUIRED', 'Full verified prepayment required before invitations', 409);
    }
    return visit;
  }
  async function event(value, session) {
    await models.EmployeeScheduleEvent.create([{ ...value, at: new Date(clock()) }], { session });
    await notifications.publish(value, session);
  }
  const offers = createSitterOfferService({ clock, repository: {
    async listOffers({ sitterId, limit, cursor, state }) {
      if (cursor) id(cursor);
      const rows = await models.EmployeeVisitOffer.find({ sitterId, ...(cursor ? { _id: { $lt: cursor } } : {}), ...(state ? { state } : {}) })
        .sort({ _id: -1 }).limit(limit + 1).lean();
      return { items: rows.slice(0, limit).map(offerView), nextCursor: rows.length > limit ? String(rows[limit - 1]._id) : null };
    },
    async getOffer({ offerId, sitterId }) { id(offerId); return offerView(await models.EmployeeVisitOffer.findOne({ _id: offerId, sitterId }).lean()); },
    async listAssignedVisits({ sitterId, limit, cursor, state }) {
      if (cursor) id(cursor);
      const rows = await col('visits').find({ sitterId: oid(sitterId), state: state ?? { $in: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] },
        ...(cursor ? { _id: { $lt: oid(cursor) } } : {}) }).sort({ _id: -1 }).limit(limit + 1).toArray();
      return { items: rows.slice(0, limit).map(row => ({ id: String(row._id), sitterId, state: row.state, version: row.version,
        startAt: row.startAt, endAt: row.endAt, serviceName: row.snapshots.serviceName, serviceAddress: row.snapshots.serviceAddress, areaCode: row.areaCode, pets: row.snapshots.pets })),
      nextCursor: rows.length > limit ? String(rows[limit - 1]._id) : null };
    },
    runOfferCommand: ({ actor, sitterId, offerId, payload, idempotencyKey, execute }) => command(actor, 'offer-response', payload, idempotencyKey, async session => {
      await employeeGuard(sitterId, session, actor.authEpoch);
      const visitForOffer = async () => {
        const offer = await models.EmployeeVisitOffer.findOne({ _id: offerId, sitterId }).session(session).lean();
        if (!offer) fail('RESOURCE_NOT_FOUND', 'Offer unavailable', 404);
        return readyVisit(String(offer.visitId), session);
      };
      return execute({
        getOffer: async () => offerView(await models.EmployeeVisitOffer.findOne({ _id: offerId, sitterId }).session(session).lean()),
        getVisit: async () => { const row = await visitForOffer(); return { ...row, id: String(row._id), sitterId: row.sitterId && String(row.sitterId),
          requestedSitterId: row.requestedSitterId && String(row.requestedSitterId), directed: !!row.requestedSitterId }; },
        recheckEligibility: async ({ visit }) => { await eligible(sitterId, visit, session); return { eligible: true }; },
        checkSlotAvailability: async () => true,
        acceptOffer: async ({ offer, expectedVersion }) => {
          const visit = await visitForOffer();
          const accepted = await models.EmployeeVisitOffer.findOneAndUpdate({ _id: offerId, sitterId, state: 'PENDING', version: expectedVersion, deadline: { $gt: new Date(clock()) } },
            { $set: { state: 'ACCEPTED', decidedAt: new Date(clock()) }, $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
          if (!accepted) fail('VERSION_CONFLICT', 'Offer changed', 409);
          const assigned = await col('visits').updateOne({ _id: visit._id, sitterId: null, state: 'SCHEDULED', version: visit.version },
            { $set: { sitterId: oid(sitterId), state: 'ASSIGNED', assignedAt: new Date(clock()) }, $inc: { version: 1 } }, { session });
          if (!assigned.matchedCount) fail('SLOT_UNAVAILABLE', 'Visit changed', 409);
          await col('bookings').updateOne({ _id: visit.bookingId }, { $inc: { version: 1, financeGuardVersion: 1 } }, { session });
          const pending = await col('visits').countDocuments({ bookingId: visit.bookingId, state: 'SCHEDULED' }, { session });
          if (!pending) await col('bookings').updateOne({ _id: visit.bookingId, state: 'DISPATCH_PENDING' }, { $set: { state: 'ASSIGNED' } }, { session });
          await models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING', _id: { $ne: offer._id } }, { $set: { state: 'REVOKED' }, $inc: { version: 1 } }, { session });
          return { state: 'ACCEPTED', sitterId, version: accepted.version, assignmentId: String(visit._id) };
        },
        declineOffer: async ({ expectedVersion }) => {
          const saved = await models.EmployeeVisitOffer.findOneAndUpdate({ _id: offerId, sitterId, state: 'PENDING', version: expectedVersion, deadline: { $gt: new Date(clock()) } },
            { $set: { state: 'DECLINED', decidedAt: new Date(clock()) }, $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
          if (!saved) fail('VERSION_CONFLICT', 'Offer changed', 409); return saved;
        },
        appendAuditAndOutbox: value => event({ ...value, sitterId }, session)
      });
    })
  } });
  async function candidates(visit) {
    const deadline = Date.now() + 10000;
    const directed = visit.requestedSitterId && String(visit.requestedSitterId);
    const rows = await models.EmployeeAvailability.find({ areas: { $in: repository.areaKeys(visit.areaCode) }, ...(directed ? { _id: directed } : {}) }).sort({ _id: 1 }).limit(100).lean();
    const allowed = [];
    const evidence = new Map();
    for (const row of rows) {
      if (Date.now() >= deadline) break;
      const user = await col('users').findOne({ _id: oid(row._id), state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } });
      const status = await col('sitterstatuses').findOne({ userId: oid(row._id), status: 'ACTIVE' });
      if (!user || !status) continue;
      try { evidence.set(row._id, await eligible(row._id, visit)); allowed.push(row._id); } catch (error) { if (error.status !== 409) throw error; }
    }
    allowed.sort((a, b) => {
      const shortlist = visit.recommendationRef?.candidateIds ?? [];
      const order = value => shortlist.includes(value) ? shortlist.indexOf(value) : shortlist.length;
      if (order(a) !== order(b)) return order(a) - order(b);
      const x = evidence.get(a), y = evidence.get(b);
      const knownX = Number.isFinite(x.adjacentTravelMinutes), knownY = Number.isFinite(y.adjacentTravelMinutes);
      if (knownX !== knownY) return knownX ? -1 : 1;
      return (knownX ? x.adjacentTravelMinutes - y.adjacentTravelMinutes : 0) || x.weeklyWorkMinutes - y.weeklyWorkMinutes || a.localeCompare(b);
    });
    if (!ranker || allowed.length < 2) return allowed;
    let timer;
    const controller = new globalThis.AbortController();
    try {
      const ranked = await Promise.race([
        Promise.resolve().then(() => ranker({ visit: { id: String(visit._id), startAt: visit.startAt, endAt: visit.endAt, areaCode: visit.areaCode }, sitterIds: [...allowed], signal: controller.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Ranking timeout')); }, 3000); })
      ]);
      if (Array.isArray(ranked) && ranked.length === allowed.length && new Set(ranked).size === allowed.length && ranked.every(value => allowed.includes(value))) return ranked;
    } catch { /* Deterministic order remains usable when advisory ranking fails. */ }
    finally { clearTimeout(timer); }
    return allowed;
  }
  const service = { offers, readContext: readyVisit,
    async queue(actor) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
      const rows = await queueRows(50);
      return { items: rows.map(row => ({ id: String(row._id), bookingId: String(row.bookingId), version: row.version, startAt: row.startAt,
        endAt: row.endAt, serviceName: row.snapshots.serviceName, areaCode: row.areaCode, reviewCode: row.dispatchReview?.code,
        pendingInvitation: row.pendingOffer ? { sitterId: row.pendingOffer.sitterId, deadline: row.pendingOffer.deadline } : null,
        requestedSitterId: row.requestedSitterId && String(row.requestedSitterId) })) };
    },
    async invite(actor, visitId, body, key) {
      id(visitId); const input = invitationInput(body);
      if (actor !== agentActor && (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role)))) fail('FORBIDDEN', 'Staff required', 403);
      return command(actor, 'invite', { visitId, ...input }, key, async session => {
        const visit = await readyVisit(visitId, session);
        if (visit.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Visit changed', 409);
        const pending = await models.EmployeeVisitOffer.findOne({ visitId: visit._id, state: 'PENDING', deadline: { $gt: new Date(clock()) } }).session(session).lean();
        if (pending) return { offerId: String(pending._id), state: 'PENDING', visitId, sitterId: pending.sitterId };
        const ranked = input.sitterId ? [input.sitterId] : await candidates(visit);
        if (!ranked.length) fail(visit.requestedSitterId ? 'DIRECTED_SCHEDULE_REVIEW_REQUIRED' : 'NO_ELIGIBLE_SITTER', 'Staff must arrange a suitable schedule with the customer', 409);
        const previous = await models.EmployeeVisitOffer.find({ visitId: visit._id, $or: [
          { state: { $in: ['DECLINED', 'EXPIRED'] } }, { state: 'PENDING', deadline: { $lte: new Date(clock()) } }
        ] }).session(session).lean();
        const selected = ranked.find(value => input.sitterId || !previous.some(row => row.sitterId === value));
        if (!selected) fail('STAFF_REVIEW_REQUIRED', 'All available employees have already been invited', 409);
        if (visit.requestedSitterId && String(visit.requestedSitterId) !== selected) fail('DIRECTED_SITTER_MISMATCH', 'Only the customer selected employee may be invited', 409);
        await employeeGuard(selected, session); await eligible(selected, visit, session);
        await models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING', deadline: { $lte: new Date(clock()) } }, { $set: { state: 'EXPIRED' }, $inc: { version: 1 } }, { session });
        const changed = await col('visits').updateOne({ _id: visit._id, state: 'SCHEDULED', version: input.expectedVersion }, { $inc: { version: 1 } }, { session });
        if (!changed.matchedCount) fail('VERSION_CONFLICT', 'Visit changed', 409);
        const [saved] = await models.EmployeeVisitOffer.create([{ visitId: visit._id, sitterId: selected, state: 'PENDING', version: 0,
          offeredAt: new Date(clock()), deadline: new Date(Math.min(clock() + 15 * 60000, visit.startAt.getTime())),
          startAt: visit.startAt, endAt: visit.endAt, serviceName: visit.snapshots.serviceName, areaCode: visit.areaCode, pets: visit.snapshots.pets ?? [] }], { session });
        await event({ type: 'OfferCreated', actorId: actor.userId, sitterId: selected, visitId, offerId: String(saved._id) }, session);
        return { offerId: String(saved._id), state: 'PENDING', visitId, sitterId: selected };
      });
    },
    async runBatch({ limit = 10 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail('VALIDATION_FAILED', 'Dispatch batch limit must be between one and twenty');
      await assertEmployeeSchedulingStorage(models.EmployeeVisitOffer.db);
      const rows = await queueRows(limit, true), result = { processed: 0, invited: 0, review: 0 };
      for (const row of rows) {
        if (row.dispatchReview?.retryAt > new Date(clock())) continue;
        result.processed++;
        try {
          await service.invite(agentActor, String(row._id), { expectedVersion: row.version }, `agent:${row._id}:${row.version}`);
          result.invited++;
        } catch (error) {
          if (error.status !== 409) throw error;
          result.review++;
          await col('visits').updateOne({ _id: row._id, version: row.version, state: 'SCHEDULED' },
            { $set: { dispatchReview: { code: error.code, at: new Date(clock()), retryAt: new Date(clock() + 60000) } } });
        }
      }
      return result;
    }
  };
  async function queueRows(limit, actionable = false) {
    return col('visits').aggregate([
      { $match: { state: 'SCHEDULED', startAt: { $gt: new Date(clock()) } } },
      { $sort: { startAt: 1, _id: 1 } },
      { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } }, { $unwind: '$booking' },
      { $match: { 'booking.carePlanState': 'APPROVED', 'booking.state': { $in: ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
        $or: [{ 'booking.paymentMode': 'POSTPAY' }, { 'booking.paymentMode': 'PREPAY', 'booking.paymentState': 'PAID' }] } },
      { $lookup: { from: models.EmployeeVisitOffer.collection.name, let: { visitId: '$_id' }, pipeline: [
        { $match: { state: 'PENDING', deadline: { $gt: new Date(clock()) }, $expr: { $eq: ['$visitId', '$$visitId'] } } },
        { $limit: 1 }, { $project: { _id: 0, sitterId: 1, deadline: 1 } }
      ], as: 'pendingOffers' } },
      ...(actionable ? [{ $match: { pendingOffers: { $size: 0 }, $or: [
        { 'dispatchReview.retryAt': { $exists: false } }, { 'dispatchReview.retryAt': { $lte: new Date(clock()) } }
      ] } }] : []),
      { $set: { pendingOffer: { $arrayElemAt: ['$pendingOffers', 0] } } },
      { $limit: limit }, { $unset: 'booking' }
    ], { maxTimeMS: 5000 }).toArray();
  }
  return service;
}
