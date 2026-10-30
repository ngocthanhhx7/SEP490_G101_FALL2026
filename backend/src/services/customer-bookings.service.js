import { Types } from 'mongoose';
import { createScopedCursor } from '../utils/scoped-cursor.js';
import { exact, fail, id, number } from '../validators/pet-care.validator.js';

export function createCustomerBookingsService({ connection, cursorSecret, clock = Date.now, enabled }) {
  const cursor = createScopedCursor({ secret: cursorSecret, namespace: 'customer-bookings-v1', clock });
  return { async list(actor, query = {}) {
    if (actor?.state !== 'ACTIVE') fail('UNAUTHENTICATED', 'Session required', 401);
    id(actor.userId);
    if (!actor.roles?.includes('CUSTOMER')) fail('FORBIDDEN', 'Customer required', 403);
    exact(query, ['limit', 'cursor']);
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    number(limit, 1, 50, true);
    if (!enabled) fail('BOOKING_READ_UNAVAILABLE', 'Booking source is disabled', 503);
    const registered = await connection.db.listCollections({ name: 'bookings' }, { nameOnly: true }).toArray();
    if (!registered.length) fail('BOOKING_READ_UNAVAILABLE', 'Booking storage is not provisioned', 503);
    const context = { ownerId: actor.userId, limit }, filter = { customerId: new Types.ObjectId(actor.userId) };
    if (query.cursor) {
      const last = cursor.decode(query.cursor, context); id(last.id);
      filter._id = { $lt: new Types.ObjectId(last.id) };
    }
    const rows = await connection.db.collection('bookings').find(filter, { projection: {
      _id: 1, state: 1, createdAt: 1, 'checkoutSnapshot.customerVisits.snapshots.serviceName': 1
    } }).sort({ _id: -1 }).limit(limit + 1).toArray();
    const page = rows.slice(0, limit);
    if (page.some(row => typeof row.state !== 'string' || !row.state)) fail('INVALID_PROJECTION', 'Invalid booking state', 503);
    return { items: page.map(row => ({ id: String(row._id), state: row.state,
      serviceName: [...new Set((row.checkoutSnapshot?.customerVisits ?? []).map(visit => visit.snapshots?.serviceName).filter(Boolean))].join(', ') })),
      nextCursor: rows.length > limit ? cursor.encode({ id: String(page.at(-1)._id) }, context) : null };
  } };
}
