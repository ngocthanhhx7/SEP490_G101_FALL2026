import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { fail, id, exact } from '../../validators/pet-care.validator.js';
import { travelCommand, travelLocation } from '../../validators/visit-travel.validator.js';
import { assertEmployeeSchedulingStorage } from './scheduling-storage.service.js';
import { edgeKey } from '../sitter-matching/routing.service.js';

const oid = value => new Types.ObjectId(value), ACTIVE = ['ASSIGNED', 'IN_PROGRESS'];
const FRESH_MS = 90000, BEFORE_MS = 120 * 60000;
export function createVisitTravelService({ repository, routingProvider, clock = Date.now }) {
  const { models, col, uow } = repository, Travel = models.EmployeeVisitTravel;
  function access(actor, visit) {
    const sitter = actor.roles?.includes('PET_SITTER') && String(visit?.sitterId) === actor.userId;
    const viewer = actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role)) ||
      (actor.roles?.includes('CUSTOMER') && String(visit?.customerId) === actor.userId);
    if (actor.state !== 'ACTIVE' || !visit || (!sitter && !viewer)) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    return sitter;
  }
  function windowOpen(visit) {
    return ACTIVE.includes(visit.state) && !!visit.sitterId && clock() >= new Date(visit.startAt).getTime() - BEFORE_MS && clock() < new Date(visit.endAt).getTime();
  }
  function view(visit, row, owner) {
    const available = windowOpen(visit), matches = row?.sitterId === String(visit.sitterId);
    const fresh = available && matches && row.sharing && row.coordinates?.length === 2 &&
      row.observedAt && clock() - row.observedAt.getTime() <= FRESH_MS && row.accuracyMeters <= 100;
    return { visitId: String(visit._id), available, version: matches ? row.version : 0,
      state: available && matches ? row.state : 'NOT_SHARING', sharing: Boolean(available && matches && row.sharing),
      fresh: Boolean(fresh), ...(owner && matches && row.sharing ? { sessionId: row.sessionId } : {}),
      location: fresh ? { coordinates: row.coordinates, accuracyMeters: row.accuracyMeters, observedAt: row.observedAt } : null,
      updatedAt: matches ? row.updatedAt : null, serverTime: new Date(clock()) };
  }
  async function load(actor, visitId) {
    id(visitId);
    const visit = await col('visits').findOne({ _id: oid(visitId) });
    const owner = access(actor, visit);
    const booking = await col('bookings').findOne({ _id: visit.bookingId });
    if (!booking || !['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(booking.state)) visit.state = 'CLOSED';
    const row = await Travel.findById(visitId).lean();
    return { visit, row, owner };
  }
  async function write(actor, visitId, work) {
    id(visitId);
    if (actor.state !== 'ACTIVE' || !actor.roles?.includes('PET_SITTER')) fail('FORBIDDEN', 'Assigned employee required', 403);
    await assertEmployeeSchedulingStorage(Travel.db);
    return uow.run(async session => {
      const visit = await col('visits').findOneAndUpdate({ _id: oid(visitId), sitterId: oid(actor.userId), state: { $in: ACTIVE },
        startAt: { $lte: new Date(clock() + BEFORE_MS) }, endAt: { $gt: new Date(clock()) } },
      { $inc: { travelGuardVersion: 1 } }, { session, returnDocument: 'after' });
      if (!visit) fail('TRAVEL_WINDOW_CLOSED', 'Travel is only available during assigned work', 409);
      const booking = await col('bookings').findOneAndUpdate({ _id: visit.bookingId, state: { $in: ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'] } },
        { $inc: { travelGuardVersion: 1 } }, { session, returnDocument: 'after' });
      if (!booking) fail('TRAVEL_WINDOW_CLOSED', 'Booking is no longer active', 409);
      await repository.employeeGuard(actor.userId, session, actor.authEpoch);
      const current = await Travel.findById(visitId).session(session).lean();
      return work(visit, current?.sitterId === actor.userId ? current : null, session);
    });
  }
  return {
    async list(actor, query = {}) {
      if (actor.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
      exact(query, ['cursor']); if (query.cursor) id(query.cursor);
      const rows = await col('visits').aggregate([
        { $match: { state: { $in: ACTIVE }, sitterId: { $ne: null }, startAt: { $lte: new Date(clock() + BEFORE_MS) },
          endAt: { $gt: new Date(clock()) }, ...(query.cursor ? { _id: { $lt: oid(query.cursor) } } : {}) } },
        { $sort: { _id: -1 } },
        { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } },
        { $match: { 'booking.state': { $in: ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }, { $limit: 21 },
        { $lookup: { from: 'users', localField: 'sitterId', foreignField: '_id', pipeline: [{ $project: { displayName: 1 } }], as: 'employee' } },
        { $project: { _id: 1, sitterId: 1, startAt: 1, endAt: 1, areaCode: 1, 'snapshots.serviceName': 1, 'employee.displayName': 1 } }
      ], { maxTimeMS: 5000 }).toArray();
      return { items: rows.slice(0, 20).map(row => ({ id: String(row._id), sitterId: String(row.sitterId),
        sitterName: row.employee?.[0]?.displayName, startAt: row.startAt, endAt: row.endAt, areaCode: row.areaCode, serviceName: row.snapshots?.serviceName })),
      nextCursor: rows.length > 20 ? String(rows[19]._id) : null };
    },
    async get(actor, visitId) { const { visit, row, owner } = await load(actor, visitId); return view(visit, row, owner); },
    async command(actor, visitId, body) {
      const { action, expectedVersion } = travelCommand(body);
      return write(actor, visitId, async (visit, row, session) => {
        if ((row?.version ?? 0) !== expectedVersion) fail('VERSION_CONFLICT', 'Reload travel status', 409);
        if (action === 'ARRIVED' && (!row?.sharing || row.state !== 'EN_ROUTE')) fail('INVALID_STATE', 'Start travel before arrival', 409);
        const at = new Date(clock()), next = { _id: visitId, sitterId: actor.userId, version: expectedVersion + 1,
          state: action === 'START' ? 'EN_ROUTE' : action === 'ARRIVED' ? 'ARRIVED' : 'STOPPED',
          sharing: action === 'START', sessionId: action === 'START' ? randomUUID() : null,
          updatedAt: at, expiresAt: new Date(visit.endAt), coordinates: [] };
        await Travel.replaceOne({ _id: visitId }, next, { upsert: true, session });
        await models.EmployeeScheduleEvent.create([{ type: `TRAVEL_${action}`, actorId: actor.userId,
          sitterId: actor.userId, visitId, at }], { session });
        return view(visit, next, true);
      });
    },
    async locate(actor, visitId, body) {
      const input = travelLocation(body, clock());
      return write(actor, visitId, async (visit, row, session) => {
        if (!row?.sharing || row.state !== 'EN_ROUTE' || row.sessionId !== input.sessionId) fail('LOCATION_SHARING_STOPPED', 'Location sharing is stopped', 409);
        if (row.observedAt && row.observedAt >= input.observedAt) fail('LOCATION_OUT_OF_ORDER', 'Newer location already received', 409);
        const next = { ...row, ...input, updatedAt: new Date(clock()) };
        await Travel.updateOne({ _id: visitId }, { $set: { ...input, updatedAt: next.updatedAt } }, { session });
        return view(visit, next, true);
      });
    },
    async eta(actor, visitId, body) {
      exact(body, []);
      const first = await load(actor, visitId), status = view(first.visit, first.row, first.owner);
      if (!status.fresh) fail('LOCATION_STALE', 'Fresh shared location required', 409);
      const destination = first.visit.snapshots?.point?.coordinates;
      if (!destination) fail('TRAVEL_REVIEW_REQUIRED', 'Confirmed destination coordinates required', 409);
      const origin = status.location.coordinates, result = await routingProvider.matrix([origin, destination]);
      const minutes = result.map.get((routingProvider.edgeKey ?? edgeKey)(origin, destination));
      // Recheck ownership, assignment and sharing after the provider request.
      const latest = await load(actor, visitId), current = view(latest.visit, latest.row, latest.owner);
      if (!current.fresh || latest.row.sessionId !== first.row.sessionId || latest.row.observedAt.getTime() !== first.row.observedAt.getTime())
        fail('LOCATION_STALE', 'Location changed; request a new estimate', 409);
      if (!Number.isFinite(minutes)) fail('ROUTING_UNAVAILABLE', 'No verified route available', 503);
      return { visitId, minutes, source: result.source, recordedAt: result.recordedAt, observedAt: first.row.observedAt,
        arrivalAt: new Date(clock() + minutes * 60000), advisory: true };
    }
  };
}
