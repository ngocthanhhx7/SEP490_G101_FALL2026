import { Types } from 'mongoose';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { AppError } from '../../utils/app-error.js';

const dependencies = {
  'customer-dashboard': ['visits', 'bookings'],
  'sitter-dashboard': ['visits', 'employeevisitoffers'],
  'staff-dashboard': ['visits', 'cases'],
  'admin-dashboard': ['visits', 'sitterapplications']
};
const invalid = () => { throw new AppError(503, 'INVALID_PROJECTION', 'Invalid operational source'); };

// Native domain collections follow P01's _id/ObjectId and startAt mapping.
// Collection absence means integration pending; no synthetic model is created.
export function createMongoOperationalDashboardRepository({ connection, cursorSecret, clock = Date.now }) {
  const codec = createScopedCursor({ secret: cursorSecret, namespace: 'operational-dashboard-v1' });
  return Object.freeze({ async readSnapshot({ scope, query }) {
    const required = dependencies[scope?.kind];
    if (!required || !Types.ObjectId.isValid(scope.userId) || scope.targetId !== scope.userId) return { ready: false };
    if (query.search) throw new AppError(422, 'VALIDATION_FAILED', 'Operational search is not supported');
    const existing = await connection.db.listCollections({ name: { $in: required } }, { nameOnly: true }).toArray();
    if (required.some(name => !existing.some(row => row.name === name))) return { ready: false };
    const context = { scope, from: query.from ?? null, to: query.to ?? null, limit: query.limit };
    const timeRange = {};
    if (query.from) timeRange.$gte = new Date(`${query.from}T00:00:00+07:00`);
    if (query.to) timeRange.$lt = new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + 86400000);
    const period = Object.keys(timeRange).length ? { startAt: timeRange } : {};
    const userId = new Types.ObjectId(scope.userId);
    let position;
    if (query.cursor) {
      position = codec.decode(query.cursor, context);
      if (!Types.ObjectId.isValid(position.id) || !Number.isFinite(Date.parse(position.startAt))) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Invalid dashboard cursor');
      }
    }
    return connection.transaction(async session => {
      const asOf = new Date(clock());
      const pipeline = [{ $match: period }];
      if (scope.kind === 'customer-dashboard') pipeline.push(
        { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } },
        { $match: { 'booking.customerId': userId } });
      if (scope.kind === 'sitter-dashboard') pipeline.push({ $match: { sitterId: userId } });
      const visits = connection.db.collection('visits');
      const options = { session, maxTimeMS: 5000, allowDiskUse: false };
      const countVisits = async filter => {
        const rows = await visits.aggregate([...pipeline, { $match: filter }, { $count: 'count' }], options).toArray();
        return rows[0]?.count ?? 0;
      };
      const metrics = {};
      if (scope.kind === 'customer-dashboard') {
        metrics.upcomingVisits = await countVisits({ state: { $in: ['SCHEDULED', 'ASSIGNED'] }, startAt: { $gte: asOf } });
        const bookingRange = Object.keys(timeRange).length ? { createdAt: timeRange } : {};
        metrics.awaitingPaymentBookings = await connection.db.collection('bookings').countDocuments({ customerId: userId,
          state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: { $gt: asOf }, ...bookingRange }, options);
      } else if (scope.kind === 'sitter-dashboard') {
        metrics.assignedVisits = await countVisits({ state: { $in: ['ASSIGNED', 'IN_PROGRESS'] } });
        const offers = await connection.db.collection('employeevisitoffers').aggregate([
          { $match: { sitterId: scope.userId, state: 'PENDING', deadline: { $gt: asOf } } },
          { $lookup: { from: 'visits', localField: 'visitId', foreignField: '_id', as: 'visit' } },
          { $unwind: '$visit' }, ...(Object.keys(timeRange).length ? [{ $match: { 'visit.startAt': timeRange } }] : []),
          { $count: 'count' }
        ], options).toArray();
        metrics.pendingOffers = offers[0]?.count ?? 0;
      } else if (scope.kind === 'staff-dashboard') {
        metrics.unassignedVisits = await countVisits({ state: 'SCHEDULED', sitterId: null });
        const cases = await connection.db.collection('cases').aggregate([
          { $match: { state: { $in: ['OPEN', 'UNDER_REVIEW'] } } },
          { $lookup: { from: 'visits', localField: 'visitId', foreignField: '_id', as: 'visit' } },
          { $unwind: '$visit' }, ...(Object.keys(timeRange).length ? [{ $match: { 'visit.startAt': timeRange } }] : []),
          { $count: 'count' }
        ], options).toArray();
        metrics.openCases = cases[0]?.count ?? 0;
      } else {
        metrics.needsAction = await countVisits({ needsAction: true });
        const applicationRange = Object.keys(timeRange).length ? { createdAt: timeRange } : {};
        metrics.pendingApplications = await connection.db.collection('sitterapplications')
          .countDocuments({ state: { $in: ['PENDING', 'UNDER_REVIEW', 'INTERVIEW'] }, ...applicationRange }, options);
      }
      const paging = position ? [{ $match: { $or: [{ startAt: { $gt: new Date(position.startAt) } },
        { startAt: new Date(position.startAt), _id: { $gt: new Types.ObjectId(position.id) } }] } }] : [];
      const rows = await visits.aggregate([...pipeline, ...paging, { $sort: { startAt: 1, _id: 1 } }, { $limit: query.limit + 1 },
        { $project: { _id: 1, state: 1, startAt: 1, sitterId: 1 } }], options).toArray();
      const page = rows.slice(0, query.limit);
      if (page.some(row => !['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'STAFF_CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(row.state)
        || !(row.startAt instanceof Date) || !Number.isFinite(row.startAt.getTime()))) invalid();
      const last = page.at(-1);
      return { ready: true, scope, metrics, asOf: asOf.toISOString(), sourceVersion: `p01-operational/v1/${asOf.toISOString()}`,
        items: page.map(row => ({ id: String(row._id), state: row.state, startsAt: row.startAt.toISOString(),
          ...(scope.kind === 'customer-dashboard' ? { customerId: scope.userId } : {}),
          ...(scope.kind === 'sitter-dashboard' ? { sitterId: String(row.sitterId) } : {}) })),
        nextCursor: rows.length > query.limit ? codec.encode({ id: String(last._id), startAt: last.startAt.toISOString() }, context) : null };
    }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
  } });
}
