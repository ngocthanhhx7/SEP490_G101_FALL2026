import { createDispatchWorkspaceService } from './dispatch-workspace.service.js';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { createSitterOfferService } from '../sitter-offer.service.js';
import { fail, id, digest, exact, instant } from '../../validators/pet-care.validator.js';
import { invitationInput, schedulingKey } from '../../validators/employee-scheduling.validator.js';
import { assertEmployeeSchedulingStorage } from './scheduling-storage.service.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const oid = value => new Types.ObjectId(value);
const offerView = row => row && ({ ...row, id: String(row._id), visitId: String(row.visitId), sitterId: row.sitterId });
export function createEmployeeDispatchService({ repository, clock = Date.now, ranker, carePlans }) {
  const { models, col, uow, employeeGuard, eligible } = repository;
  const workspace = createDispatchWorkspaceService({col,clock});
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
        recheckEligibility: async ({ visit }) => {
          const saved = await models.EmployeeVisitOffer.findOne({ _id: offerId, sitterId }).session(session).lean();
          await eligible(sitterId, visit, session, { requireOrigin: saved?.originRouteRequired === true }); return { eligible: true };
        },
        checkSlotAvailability: async () => true,
        acceptOffer: async ({ offer, expectedVersion }) => {
          const visit = await visitForOffer();
          const accepted = await models.EmployeeVisitOffer.findOneAndUpdate({ _id: offerId, sitterId, state: 'PENDING', version: expectedVersion, deadline: { $gt: new Date(clock()) } },
            { $set: { state: 'ACCEPTED', decidedAt: new Date(clock()) }, $inc: { version: 1 } }, { session, returnDocument: 'after' }).select('+featureSnapshot').lean();
          if (!accepted) fail('VERSION_CONFLICT', 'Offer changed', 409);
          const assigned = await col('visits').updateOne({ _id: visit._id, sitterId: null, state: 'SCHEDULED', version: visit.version },
            { $set: { sitterId: oid(sitterId), state: 'ASSIGNED', assignedAt: new Date(clock()),
              ...(accepted.featureSnapshot ? { assignedFeatureSnapshot: accepted.featureSnapshot } : {}) }, $inc: { version: 1 } }, { session });
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
          if (!saved) fail('VERSION_CONFLICT', 'Offer changed', 409);
          await col('visits').updateOne({ _id: saved.visitId, state: 'SCHEDULED', sitterId: null }, { $inc: { version: 1 } }, { session });
          return saved;
        },
        appendAuditAndOutbox: value => event({ ...value, sitterId }, session)
      });
    })
  } });
  async function candidates(visit) {
    const directed = visit.requestedSitterId && String(visit.requestedSitterId);
    const rows = await models.EmployeeAvailability.find({ areas: { $in: repository.areaKeys(visit.areaCode) }, ...(directed ? { _id: directed } : {}) }).sort({ _id: 1 }).limit(101).lean();
    if (rows.length > 100) fail('DISPATCH_SEARCH_LIMIT', 'Employee population requires a wider reviewed dispatch search', 409);
    const allowed = [];
    const rejected = {};
    const evidence = new Map();
    const ids = rows.map(row => oid(row._id));
    const [users, statuses] = ids.length ? await Promise.all([
      col('users').find({ _id: { $in: ids }, state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } }, { projection: { _id: 1 } }).limit(101).toArray(),
      col('sitterstatuses').find({ userId: { $in: ids }, status: 'ACTIVE' }, { projection: { userId: 1 } }).limit(101).toArray()
    ]) : [[], []];
    const activeUsers = new Set(users.map(user => String(user._id))), activeStatuses = new Set(statuses.map(status => String(status.userId)));
    let next = 0;
    async function scan() {
      while (next < rows.length) {
        const row = rows[next++];
        if (!activeUsers.has(row._id) || !activeStatuses.has(row._id)) { rejected.SITTER_NOT_ELIGIBLE = (rejected.SITTER_NOT_ELIGIBLE ?? 0) + 1; continue; }
        try { evidence.set(row._id, await eligible(row._id, visit, undefined, { requireOrigin: true })); allowed.push(row._id); }
        catch (error) { if (error.status !== 409) throw error; rejected[error.code] = (rejected[error.code] ?? 0) + 1; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, scan));
    if (!allowed.length) {
      throw new AppError(409, directed ? 'DIRECTED_SCHEDULE_REVIEW_REQUIRED' : 'NO_ELIGIBLE_SITTER', 'No eligible employee',
        { diagnostics: { registered: rows.length, eligible: 0, rejected } });
    }
    allowed.sort((a, b) => {
      const shortlist = visit.recommendationRef?.candidateIds ?? [];
      const order = value => shortlist.includes(value) ? shortlist.indexOf(value) : shortlist.length;
      if (order(a) !== order(b)) return order(a) - order(b);
      const x = evidence.get(a), y = evidence.get(b);
      if (x.arrivalTravelMinutes !== y.arrivalTravelMinutes) return x.arrivalTravelMinutes - y.arrivalTravelMinutes;
      const knownX = Number.isFinite(x.adjacentTravelMinutes), knownY = Number.isFinite(y.adjacentTravelMinutes);
      if (knownX !== knownY) return knownX ? -1 : 1;
      return (knownX ? x.adjacentTravelMinutes - y.adjacentTravelMinutes : 0) || x.weeklyWorkMinutes - y.weeklyWorkMinutes || a.localeCompare(b);
    });
    if (!ranker) return { sitterIds: allowed };
    let timer;
    const controller = new globalThis.AbortController();
    try {
      const ranked = await Promise.race([
        Promise.resolve().then(() => ranker({ visit: { id: String(visit._id), startAt: visit.startAt, endAt: visit.endAt, areaCode: visit.areaCode, serviceId: String(visit.serviceId), location: visit.location, point: visit.snapshots.point, pets: visit.snapshots.pets?.map(({ id, species, weightKg, traits }) => ({ id, species, weightKg, traits })) }, sitterIds: [...allowed], signal: controller.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Ranking timeout')); }, 3000); })
      ]);
      const ids = Array.isArray(ranked) ? ranked : ranked?.sitterIds;
      if (Array.isArray(ids) && ids.length === allowed.length && new Set(ids).size === allowed.length && ids.every(value => allowed.includes(value))) {
        const snapshot = ranked.featureSnapshot, keys = ['fit', 'travel', 'quality', 'reliability', 'workload'];
        const captured = snapshot?.version === 'PWC_MATCH_FEATURES_V1' && Number.isFinite(Date.parse(snapshot.decisionAt)) && Date.parse(snapshot.decisionAt) <= clock() &&
          Date.parse(snapshot.slotStartAt) === visit.startAt.getTime() && Date.parse(snapshot.slotEndAt) === visit.endAt.getTime() &&
          Array.isArray(snapshot.candidates) && snapshot.candidates.length <= ids.length && new Set(snapshot.candidates.map(row => row.sitterId)).size === snapshot.candidates.length &&
          snapshot.candidates.every(row => ids.includes(row.sitterId) && Object.keys(row.features ?? {}).length === keys.length && keys.every(key =>
            Number.isFinite(row.features[key]) && row.features[key] >= 0 && row.features[key] <= 1 && Number.isFinite(Date.parse(snapshot.featuresAsOf?.[key])) && Date.parse(snapshot.featuresAsOf[key]) <= Date.parse(snapshot.decisionAt)));
        return { sitterIds: ids, ...(captured ? { featureSnapshot: snapshot } : {}) };
      }
    } catch { /* Deterministic order remains usable when advisory ranking fails. */ }
    finally { clearTimeout(timer); }
    return { sitterIds: allowed };
  }
  const service = { offers, readContext: readyVisit,
    async previewCandidates(actor, visitId, input) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
      id(visitId); exact(input, ['startAt', 'areaCode'], ['startAt']);
      const visit = await readyVisit(visitId), startAt = new Date(instant(input.startAt));
      const areaCode = input.areaCode ?? visit.areaCode;
      if (!repository.coverageAreas.some(row => row.code === areaCode && (areaCode === visit.areaCode || visit.location === 'HOME' && row.parentCode === visit.areaCode)))
        fail('VALIDATION_FAILED', 'Choose the current area or a more precise home area');
      const revised = { ...visit, startAt, endAt: new Date(startAt.getTime() + visit.endAt.getTime() - visit.startAt.getTime()), areaCode };
      try {
        const { sitterIds: ids } = await candidates(revised);
        const users = await col('users').find({ _id: { $in: ids.map(oid) } }, { projection: { displayName: 1 } }).toArray();
        return { items: ids.map(sitterId => ({ sitterId, displayName: users.find(row => String(row._id) === sitterId)?.displayName })),
          areaCode, startAt, endAt: revised.endAt };
      } catch (error) {
        if (!error.details?.diagnostics) throw error;
        return { items: [], diagnostics: error.details.diagnostics, areaCode, startAt, endAt: revised.endAt };
      }
    },
    async queue(actor) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
      const rows = await queueRows(51), today = await workspace.read();
      const people=await col('users').find({_id:{$in:rows.flatMap(r=>[r.customerId,r.requestedSitterId]).filter(Boolean).map(value=>oid(String(value)))}},{projection:{displayName:1}}).toArray();
      const name=id=>people.find(p=>String(p._id)===String(id))?.displayName??null;
      return { today, queueHasMore: rows.length>50, workAreas: repository.coverageAreas, items: rows.slice(0,50).map(row => ({ id: String(row._id), bookingId: String(row.bookingId), customerName:name(row.customerId), requestedSitterName:name(row.requestedSitterId), version: row.version, startAt: row.startAt,
        endAt: row.endAt, serviceName: row.snapshots.serviceName, areaCode: row.areaCode, reviewCode: row.dispatchReview?.code,
        dispatchState: row.pendingOffer ? 'AWAITING_RESPONSE' : row.dispatchReview ? 'NEEDS_STAFF' : 'SYSTEM_SEARCHING',
        pendingInvitation: row.pendingOffer ? { sitterId: row.pendingOffer.sitterId, deadline: row.pendingOffer.deadline } : null,
        pendingInvitationCount: row.pendingOffers.length,
        diagnostics: row.dispatchReview?.diagnostics, location: row.location, boarding: row.snapshots.boarding === true,
        requestedSitterId: row.requestedSitterId && String(row.requestedSitterId) })) };
    },
    async invite(actor, visitId, body, key) {
      id(visitId); const input = invitationInput(body);
      if (actor !== agentActor && (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role)))) fail('FORBIDDEN', 'Staff required', 403);
      return command(actor, 'invite', { visitId, ...input }, key, async session => {
        const visit = await readyVisit(visitId, session);
        if (visit.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Visit changed', 409);
        if (visit.startAt <= new Date(clock())) fail('SHIFT_START_REACHED', 'Customer must confirm a future schedule before invitations', 409);
        const pending = await models.EmployeeVisitOffer.find({ visitId: visit._id, state: 'PENDING', deadline: { $gt: new Date(clock()) } }).session(session).lean();
        const target = visit.requestedSitterId || input.sitterId ? 1 : 5;
        const resultView = rows => ({ offerId: String(rows[0]._id), state: 'PENDING', visitId, sitterId: rows[0].sitterId,
          invitationCount: rows.length, minimumRequested: target, shortfall: Math.max(0, target - rows.length),
          invitations: rows.map(row => ({ offerId: String(row._id), sitterId: row.sitterId, deadline: row.deadline })) });
        if (pending.length >= target) return resultView(pending);
        if (actor !== agentActor && !visit.dispatchReview) fail('SYSTEM_DISPATCH_IN_PROGRESS', 'System dispatch must exhaust automatic invitations before staff intervention', 409);
        const ranking = input.sitterId ? { sitterIds: [input.sitterId] } : await candidates(visit);
        const ranked = ranking.sitterIds;
        if (!ranked.length) {
          if (pending.length) return resultView(pending);
          fail(visit.requestedSitterId ? 'DIRECTED_SCHEDULE_REVIEW_REQUIRED' : 'NO_ELIGIBLE_SITTER', 'Staff must arrange a suitable schedule with the customer', 409);
        }
        const previous = await models.EmployeeVisitOffer.find({ visitId: visit._id, $or: [
          { state: { $in: ['DECLINED', 'EXPIRED'] } }, { state: 'PENDING', deadline: { $lte: new Date(clock()) } }
        ] }).session(session).lean();
        const selected = ranked.filter(value => !pending.some(row => row.sitterId === value) &&
          (input.sitterId || !previous.some(row => row.sitterId === value))).slice(0, target - pending.length);
        if (!selected.length) {
          if (pending.length) return resultView(pending);
          fail('STAFF_REVIEW_REQUIRED', 'All available employees have already been invited', 409);
        }
        for (const sitterId of [...selected].sort()) {
          if (visit.requestedSitterId && String(visit.requestedSitterId) !== sitterId) fail('DIRECTED_SITTER_MISMATCH', 'Only the customer selected employee may be invited', 409);
          await employeeGuard(sitterId, session); await eligible(sitterId, visit, session, { requireOrigin: !input.sitterId });
        }
        await models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING', deadline: { $lte: new Date(clock()) } }, { $set: { state: 'EXPIRED' }, $inc: { version: 1 } }, { session });
        const changed = await col('visits').updateOne({ _id: visit._id, state: 'SCHEDULED', version: input.expectedVersion },
          { $inc: { version: 1 }, $unset: { dispatchReview: 1 } }, { session });
        if (!changed.matchedCount) fail('VERSION_CONFLICT', 'Visit changed', 409);
        const saved = await models.EmployeeVisitOffer.create(selected.map(sitterId => ({ visitId: visit._id, sitterId, state: 'PENDING', version: 0,
          offeredAt: new Date(clock()), deadline: new Date(Math.min(clock() + 15 * 60000, visit.startAt.getTime())),
          originRouteRequired: !input.sitterId,
          ...(ranking.featureSnapshot?.candidates.some(row => row.sitterId === sitterId) ? { featureSnapshot: { ...ranking.featureSnapshot, candidates: undefined,
            sitterId, features: ranking.featureSnapshot.candidates.find(row => row.sitterId === sitterId).features } } : {}),
          startAt: visit.startAt, endAt: visit.endAt, serviceName: visit.snapshots.serviceName, areaCode: visit.areaCode, pets: visit.snapshots.pets ?? [] })), { session, ordered: true });
        for (const offer of saved) await event({ type: 'OfferCreated', actorId: actor.userId, sitterId: offer.sitterId, visitId, offerId: String(offer._id) }, session);
        return resultView([...pending, ...saved]);
      });
    },
    async runBatch({ limit = 10 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail('VALIDATION_FAILED', 'Dispatch batch limit must be between one and twenty');
      await assertEmployeeSchedulingStorage(models.EmployeeVisitOffer.db);
      await carePlans?.runBatch({ limit });
      const rows = [...await queueRows(limit, true, true), ...await queueRows(limit, true)], result = { processed: 0, invited: 0, review: 0 };
      for (const row of rows) {
        if (row.dispatchReview?.retryAt > new Date(clock())) continue;
        result.processed++;
        try {
          if (row.startAt <= new Date(clock())) fail('SHIFT_START_REACHED', 'No employee accepted before shift start', 409);
          await service.invite(agentActor, String(row._id), { expectedVersion: row.version }, `agent:${row._id}:${row.version}`);
          result.invited++;
        } catch (error) {
          if (error.status !== 409) throw error;
          result.review++;
          if (!['NO_ELIGIBLE_SITTER', 'DIRECTED_SCHEDULE_REVIEW_REQUIRED', 'STAFF_REVIEW_REQUIRED',
            'TRAVEL_REVIEW_REQUIRED', 'DAY_ORIGIN_MISSING', 'DISPATCH_SEARCH_LIMIT', 'SHIFT_START_REACHED'].includes(error.code)) continue;
          await uow.run(async session => {
            const updated = await col('visits').findOneAndUpdate({ _id: row._id, version: row.version, state: 'SCHEDULED', sitterId: null },
              { $set: { dispatchReview: { code: error.code, at: new Date(clock()), retryAt: new Date(clock() + 60000),
                ...(error.details?.diagnostics || row.dispatchReview?.diagnostics ? { diagnostics: error.details?.diagnostics ?? row.dispatchReview.diagnostics } : {}) } } },
              { session, returnDocument: 'before' });
            if (updated && !updated.dispatchReview) await event({ type: 'DispatchReviewRequired', actorId: agentActor.userId,
              visitId: String(row._id), detail: { code: error.code, version: row.version } }, session);
          });
        }
      }
      return result;
    }
  };
  async function queueRows(limit, actionable = false, overdue = false) {
    return col('visits').aggregate([
      { $match: { state: 'SCHEDULED', ...(actionable ? { startAt: { [overdue ? '$lte' : '$gt']: new Date(clock()) },
        ...(overdue ? { 'dispatchReview.code': { $ne: 'SHIFT_START_REACHED' } } : {}) }
        : { $or: [{ startAt: { $gt: new Date(clock()) } }, { dispatchReview: { $exists: true } }] }) } },
      { $sort: { startAt: 1, _id: 1 } },
      { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } }, { $unwind: '$booking' },
      { $match: { 'booking.carePlanState': 'APPROVED', 'booking.state': { $in: ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
        $or: [{ 'booking.paymentMode': 'POSTPAY' }, { 'booking.paymentMode': 'PREPAY', 'booking.paymentState': 'PAID' }] } },
      { $lookup: { from: models.EmployeeVisitOffer.collection.name, let: { visitId: '$_id' }, pipeline: [
        { $match: { state: 'PENDING', deadline: { $gt: new Date(clock()) }, $expr: { $eq: ['$visitId', '$$visitId'] } } },
        { $limit: 5 }, { $project: { _id: 0, sitterId: 1, deadline: 1 } }
      ], as: 'pendingOffers' } },
      ...(actionable ? [{ $match: { $expr: { $lt: [{ $size: '$pendingOffers' }, { $cond: ['$requestedSitterId', 1, 5] }] }, $or: [
        { 'dispatchReview.retryAt': { $exists: false } }, { 'dispatchReview.retryAt': { $lte: new Date(clock()) } }
      ] } }] : []),
      { $set: { pendingOffer: { $arrayElemAt: ['$pendingOffers', 0] } } },
      { $limit: limit }, { $unset: 'booking' }
    ], { maxTimeMS: 5000 }).toArray();
  }
  return service;
}
