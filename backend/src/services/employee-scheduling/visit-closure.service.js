import { Types } from 'mongoose';
import { fail, id, digest } from '../../validators/pet-care.validator.js';
import { schedulingKey } from '../../validators/employee-scheduling.validator.js';
import { visitClosureInput } from '../../validators/visit-closure.validator.js';
import { assertEmployeeSchedulingStorage } from './scheduling-storage.service.js';

// GBR-24: a visit not checked out 2 hours after its end goes to Staff, who close it with a reason.
export const CHECK_OUT_GRACE_MS = 2 * 60 * 60 * 1000;
const LIST_LIMIT = 50;
const MEDIA_ID = /^[a-f0-9]{64}$/;
const oid = value => new Types.ObjectId(value);
const staffOnly = actor => {
  if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role)))
    fail('FORBIDDEN', 'Staff required', 403);
};

// Close-visit command and the read model of visits waiting for it. It writes only the visit it closes
// and an audit event: no booking, billing, earnings or payroll state.
export function createVisitClosureService({ repository, clock = Date.now }) {
  const { models, col, uow } = repository;
  const visits = () => col('visits');
  const closesAt = visit => new Date(visit.endAt.getTime() + CHECK_OUT_GRACE_MS);
  const closable = (row, now) => row.state === 'IN_PROGRESS' && !row.checkOutAt && row.checkInAt instanceof Date
    && row.endAt instanceof Date && closesAt(row).getTime() <= now;

  // Same rule the complaint module uses for a Staff-closed visit: a READY check-in image owned by the sitter and bound to the visit.
  async function checkInPhotoVisitIds(rows, session) {
    const byMedia = new Map();
    for (const row of rows) {
      for (const ref of row.evidenceRefs ?? []) {
        if (ref.kind === 'CHECK_IN' && MEDIA_ID.test(ref.mediaId ?? '')) byMedia.set(ref.mediaId, row);
      }
    }
    if (!byMedia.size) return new Set();
    const images = await col('privateimages').find({ _id: { $in: [...byMedia.keys()] }, state: 'READY', careKind: 'CHECK_IN' },
      { session, projection: { _id: 1, ownerId: 1, careVisitId: 1 } }).limit(500).toArray();
    return new Set(images.filter(image => {
      const row = byMedia.get(image._id);
      return row.sitterId && String(image.ownerId) === String(row.sitterId) && image.careVisitId === String(row._id);
    }).map(image => String(byMedia.get(image._id)._id)));
  }

  async function people(rows) {
    const ids = [...new Set(rows.flatMap(row => [row.customerId, row.sitterId]).filter(Boolean).map(String))].map(oid);
    const users = ids.length ? await col('users').find({ _id: { $in: ids } }, { projection: { displayName: 1 } }).limit(ids.length).toArray() : [];
    return value => users.find(user => String(user._id) === String(value))?.displayName ?? null;
  }

  async function bookingCodes(rows) {
    const ids = [...new Set(rows.map(row => String(row.bookingId)))].map(oid);
    const bookings = ids.length ? await col('bookings').find({ _id: { $in: ids } }, { projection: { bookingCode: 1, code: 1 } }).limit(ids.length).toArray() : [];
    return value => {
      const booking = bookings.find(row => String(row._id) === String(value));
      return booking?.bookingCode ?? booking?.code ?? null;
    };
  }

  async function decorate(rows, now) {
    const [photoIds, name, code] = await Promise.all([checkInPhotoVisitIds(rows), people(rows), bookingCodes(rows)]);
    return rows.map(row => ({ id: String(row._id), bookingId: String(row.bookingId), bookingCode: code(row.bookingId), version: row.version,
      serviceName: row.snapshots?.serviceName ?? null, areaCode: row.areaCode ?? null,
      startAt: row.startAt, endAt: row.endAt, checkInAt: row.checkInAt ?? null,
      customerName: name(row.customerId), sitterId: row.sitterId ? String(row.sitterId) : null, sitterName: name(row.sitterId),
      hasCheckInPhoto: photoIds.has(String(row._id)), reasonCode: 'NOT_CHECKED_OUT',
      overdueMs: Math.max(0, now - row.endAt.getTime()), closableAt: closesAt(row) }));
  }

  return {
    // Visits whose pet sitter has not checked out 2 hours after the end, oldest end first.
    async needsAction(actor) {
      staffOnly(actor);
      const now = clock();
      const rows = await visits().find({ state: 'IN_PROGRESS', checkInAt: { $type: 'date' }, checkOutAt: { $in: [null, undefined] },
        endAt: { $lte: new Date(now - CHECK_OUT_GRACE_MS) } }).sort({ endAt: 1, _id: 1 }).limit(LIST_LIMIT + 1).maxTimeMS(5000).toArray();
      return { items: await decorate(rows.slice(0, LIST_LIMIT), now), hasMore: rows.length > LIST_LIMIT, asOf: new Date(now) };
    },

    // Read-only data for the dialog: visit, pet sitter, check-in time and whether there is a check-in photo.
    async details(actor, visitId) {
      staffOnly(actor);
      const now = clock();
      const row = await visits().findOne({ _id: oid(id(visitId)) });
      if (!row) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
      if (!closable(row, now)) fail('INVALID_STATE', 'The visit cannot be closed', 409);
      return (await decorate([row], now))[0];
    },

    async close(actor, visitId, body, key) {
      staffOnly(actor);
      id(visitId);
      const input = visitClosureInput(body);
      schedulingKey(key);
      await assertEmployeeSchedulingStorage(models.EmployeeVisitOffer.db);
      const commandId = digest([actor.userId, 'visit-closure', key]), fingerprint = digest({ visitId, ...input });
      for (let attempt = 0; ; attempt++) {
        try {
          return await uow.run(async session => {
            const staff = await col('users').findOne({ _id: oid(actor.userId), state: 'ACTIVE', synthetic: { $ne: true },
              roles: { $in: ['STAFF', 'ADMIN'] }, ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { session });
            if (!staff) fail('FORBIDDEN', 'Current account cannot perform this operation', 403);
            const previous = await models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
            if (previous) {
              if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key reused', 409);
              return previous.result;
            }
            const at = new Date(clock());
            const row = await visits().findOne({ _id: oid(visitId) }, { session });
            if (!row) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
            if (row.state !== 'IN_PROGRESS' || row.checkOutAt || !(row.checkInAt instanceof Date) || !(row.endAt instanceof Date))
              fail('INVALID_STATE', 'Only a checked-in visit without a check-out can be closed', 409);
            if (!closable(row, at.getTime())) fail('CLOSE_NOT_ALLOWED_YET', 'The visit can be closed 2 hours after its end', 409);
            if (row.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Visit changed', 409);
            const hasCheckInPhoto = (await checkInPhotoVisitIds([row], session)).has(String(row._id));
            // Without a check-in photo the visit is cancelled at no charge instead. That branch waits until its fields are agreed.
            if (!hasCheckInPhoto) fail('CLOSE_WITHOUT_PHOTO_UNAVAILABLE', 'Closing a visit without a check-in photo is not available yet', 409);
            const closure = { byUserId: actor.userId, at, reason: input.reason, hasCheckInPhoto };
            const saved = await visits().findOneAndUpdate({ _id: row._id, version: row.version, state: 'IN_PROGRESS', checkOutAt: { $in: [null, undefined] } },
              { $set: { state: 'STAFF_CLOSED', closedAt: at, hasCheckInPhoto, closure }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
            if (!saved) fail('VERSION_CONFLICT', 'Visit changed', 409);
            await models.EmployeeScheduleEvent.create([{ type: 'VisitStaffClosed', actorId: actor.userId, sitterId: String(row.sitterId),
              visitId, at, detail: { hasCheckInPhoto, version: saved.version } }], { session });
            const result = { visitId, state: 'STAFF_CLOSED', version: saved.version, closedAt: at, hasCheckInPhoto };
            await models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint, result, createdAt: at }], { session });
            return result;
          });
        } catch (error) {
          if (error.code !== 11000 || attempt >= 3) throw error;
        }
      }
    }
  };
}
