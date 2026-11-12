import { Types } from 'mongoose';
import { bookingChangeModels } from '../../models/booking-change.model.js';
import { AppError } from '../../utils/app-error.js';
import { changeDeadline } from './booking-change-policy.js';

export const oid = value => new Types.ObjectId(value);
export const RECHECK_MS = 60000;
const VISIT_LIMIT = 60;

export function activeItems(change) {
  const removed = new Set(change.removedVisitIds);
  return change.items.filter(item => !removed.has(item.visitId));
}

export async function provisionBookingChanges(connection) {
  for (const model of Object.values(bookingChangeModels(connection))) {
    await model.createCollection();
    await model.createIndexes();
  }
}

export function createBookingChangeStore(connection) {
  const model = bookingChangeModels(connection);
  const col = name => connection.db.collection(name);
  const requests = col(model.BookingChangeRequest.collection.name);
  const claims = col(model.BookingChangeVisitClaim.collection.name);
  const commands = col(model.BookingChangeCommand.collection.name);
  const notices = col(model.BookingChangeNotice.collection.name);
  const bookings = col('bookings');
  const visits = col('visits');

  async function assertStorage() {
    const names = Object.values(model).map(item => item.collection.name);
    const existing = await connection.db.listCollections({ name: { $in: names } }, { nameOnly: true }).toArray();
    if (existing.length !== names.length)
      throw new AppError(503, 'BOOKING_CHANGE_STORAGE_NOT_READY', 'Provision booking change storage first.');
  }

  async function readBooking(bookingId, session, customerId) {
    const booking = await bookings.findOne({ _id: oid(bookingId), ...(customerId ? { customerId: oid(customerId) } : {}) }, { session });
    if (!booking) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy lịch đặt.');
    return booking;
  }

  async function readVisits(booking, session) {
    const rows = await visits.find({ bookingId: booking._id, state: { $nin: ['CANCELLED', 'SUPERSEDED'] },
      ...(booking.visitIds?.length ? { _id: { $in: booking.visitIds } } : {})
    }, { session, maxTimeMS: 3000 }).sort({ startAt: 1, _id: 1 }).limit(VISIT_LIMIT + 1).toArray();
    if (rows.length > VISIT_LIMIT || rows.some(row => !(row.startAt instanceof Date) || !(row.endAt instanceof Date) ||
      !Number.isFinite(+row.startAt) || !Number.isFinite(+row.endAt) || row.endAt <= row.startAt || !Number.isSafeInteger(row.version)))
      throw new AppError(409, 'BOOKING_CHANGE_SCHEDULE_UNAVAILABLE', 'Cần kiểm tra lại dữ liệu lịch đặt.');
    return rows;
  }

  async function names(ids, session) {
    const unique = [...new Set(ids.filter(Boolean).map(String))];
    const users = unique.length ? await col('users').find({ _id: { $in: unique.map(oid) } }, {
      session, projection: { displayName: 1 }
    }).toArray() : [];
    return new Map(users.map(user => [String(user._id), user.displayName]));
  }

  async function savePending(change, updates, session) {
    const current = await requests.findOneAndUpdate({ _id: change._id, state: 'PENDING', version: change.version },
      { $set: updates, $inc: { version: 1 } }, { session, returnDocument: 'after' });
    if (!current) throw new AppError(409, 'VERSION_CONFLICT', 'Yêu cầu đã thay đổi. Vui lòng tải lại.');
    return current;
  }

  async function releaseClaims(change, ids, session) {
    await claims.deleteMany({ requestId: change._id, ...(ids ? { _id: { $in: ids } } : {}) }, { session });
  }

  async function queueNotice(change, eventType, recipients, title, message, now, session, deepLink) {
    await notices.insertOne({
      _id: String(change._id) + ':' + eventType + ':' + recipients[0].role, requestId: change._id,
      eventType, recipients, title, message, deepLink, nextAttemptAt: now, deliveredAt: null
    }, { session });
  }

  async function reconcile(change, now, session) {
    if (change.state !== 'PENDING') return change;
    const pending = activeItems(change);
    const cancelled = await visits.find({ _id: { $in: pending.map(item => oid(item.visitId)) }, state: 'CANCELLED' },
      { session, projection: { cancelledAt: 1, canceledAt: 1 } }).toArray();
    const byTime = cancelled.map(visit => ({ id: String(visit._id), at: visit.cancelledAt ?? visit.canceledAt }))
      .sort((left, right) => +(left.at ?? 0) - +(right.at ?? 0));
    let remaining = pending, expiresAt = change.expiresAt;
    const removed = [];
    for (const cancelledVisit of byTime) {
      if (cancelledVisit.at && cancelledVisit.at >= expiresAt) break;
      removed.push(cancelledVisit.id);
      remaining = remaining.filter(item => item.visitId !== cancelledVisit.id);
      if (remaining.length) expiresAt = changeDeadline(remaining);
    }
    const state = remaining.length === 0 ? 'CLOSED' : expiresAt <= now ? 'EXPIRED' : 'PENDING';
    if (!removed.length && state === 'PENDING') return change;
    const updated = await savePending(change, {
      state, expiresAt, removedVisitIds: [...(change.removedVisitIds ?? []), ...removed],
      recheckAt: new Date(+now + RECHECK_MS), ...(state === 'PENDING' ? {} : { resolvedAt: now })
    }, session);
    await releaseClaims(change, state === 'PENDING' ? removed : null, session);
    if (state === 'EXPIRED') await queueNotice(change, 'BookingChangeExpired',
      [{ recipientId: String(change.customerId), role: 'CUSTOMER' }],
      'Yêu cầu đổi giờ đã hết hạn', 'Yêu cầu đổi giờ đã hết hạn. Lịch giữ giờ cũ.', now, session,
      '/account/bookings/' + change.bookingId);
    return updated;
  }

  return { col, bookings, visits, requests, claims, commands, notices, assertStorage, readBooking, readVisits,
    names, savePending, releaseClaims, queueNotice, reconcile };
}
