import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createBookingFinancialHolds } from '../settlements/booking-financial-holds.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { hasRole } from '../../utils/roles.js';
import { createEmployeeBookingHolds } from '../payroll/employee-booking-hold.service.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { MEDIA_ID } from '../../validators/complaint.validator.js';
import { bookingSummary, visitSummary } from './complaint-projection.js';
import { COMPLAINT_SCHEMA_VERSION } from './complaint-lifecycle.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
const ref = value => value === null || value === undefined ? null : String(value);
const fail = (status, code) => { throw new AppError(status, code, code); };
const key = identity => 'complaint:' + hash(identity);

const asBooking = row => row ? { ...row, id: ref(row._id), customerId: ref(row.customerId),
  code: row.bookingCode ?? row.code ?? null } : null;
const asVisit = (row, details) => ({ ...row, id: ref(row._id), bookingId: ref(row.bookingId), sitterId: ref(row.sitterId),
  serviceName: row.snapshots?.serviceName ?? row.serviceName ?? null, ...details });
const asCase = row => row ? { ...row, id: ref(row._id), visitId: ref(row.visitId), bookingId: ref(row.bookingId),
  customerId: ref(row.customerId), sitterId: ref(row.sitterId) } : null;
const escapeRegex = value => value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');

function matchList(actor, filter) {
  const match = { kind: 'COMPLAINT' };
  if (!hasRole(actor.roles, 'STAFF') && !oid(actor.userId)) fail(403, 'FORBIDDEN');
  if (hasRole(actor.roles, 'CUSTOMER')) match.customerId = oid(actor.userId);
  else if (hasRole(actor.roles, 'PET_SITTER')) {
    match.sitterId = oid(actor.userId);
    match.visitId = { $type: 'objectId' };
  } else if (!hasRole(actor.roles, 'STAFF')) fail(403, 'FORBIDDEN');
  if (filter.visitId) {
    if (!oid(filter.visitId)) fail(422, 'VALIDATION_FAILED');
    match.visitId = oid(filter.visitId);
  }
  if (filter.proposals) match['proposal.status'] = 'PENDING';
  if (filter.category) match.category = filter.category === 'OTHER' ? { $in: ['OTHER', null] } : filter.category;
  return match;
}

function join(collection, field, name, project) {
  return { $lookup: { from: collection, localField: field, foreignField: '_id', pipeline: [{ $project: project }], as: name } };
}

function listFields() {
  return {
    rowId: { $toString: '$_id' },
    displayBookingId: { $toString: '$bookingId' },
    submittedAt: { $convert: { input: { $ifNull: ['$createdAt', '$openedAt'] }, to: 'date', onError: new Date(0), onNull: new Date(0) } },
    displayState: { $switch: { branches: [
      { case: { $eq: ['$state', 'UNDER_REVIEW'] }, then: { $cond: [{ $ifNull: ['$latestObjection.reason', false] }, 'ESCALATED', 'OPEN'] } },
      { case: { $eq: ['$state', 'CLOSED'] }, then: 'RESOLVED' }
    ], default: '$state' } },
    displayCode: { $ifNull: ['$code', { $concat: ['KN-', { $toUpper: { $substrBytes: [
      { $replaceAll: { input: { $toString: '$_id' }, find: '-', replacement: '' } }, 0, 12
    ] } }] }] }
  };
}

function pageStages({ filter, cursor, context, codec, limit, stateField }) {
  const dir = filter.sort === 'oldest' ? 1 : -1;
  const cmp = dir === 1 ? '$gt' : '$lt';
  const stages = [];
  if (filter.state) stages.push({ $match: { [stateField]: filter.state } });
  if (cursor) {
    const position = codec.decode(cursor, context);
    if (!Number.isSafeInteger(position.at) || typeof position.id !== 'string' || position.id.length > 128) fail(422, 'VALIDATION_FAILED');
    const at = new Date(position.at);
    stages.push({ $match: { $or: [{ submittedAt: { [cmp]: at } }, { submittedAt: at, rowId: { [cmp]: position.id } }] } });
  }
  return [...stages, { $sort: { submittedAt: dir, rowId: dir } }, { $limit: limit + 1 }];
}

export function createMongoComplaintRepository({ connection, finance, cursorSecret, phones,
  compensationModel = 'EMPLOYEE', clock = Date.now }) {
  if (!['EMPLOYEE', 'LEGACY_PARTNER'].includes(compensationModel)) throw new TypeError('Invalid compensation model');
  const { FinanceSourceCommand: commands, FinanceSourceEvent: events } = financeSourceModels(connection);
  const unitOfWork = createUnitOfWork(connection);
  const holds = compensationModel === 'EMPLOYEE' ? createEmployeeBookingHolds({ connection, finance })
    : createBookingFinancialHolds({ connection, finance });
  const col = name => connection.db.collection(name);
  const codec = createScopedCursor({ secret: cursorSecret, namespace: 'complaint-primary-v2' });
  const notifications = createDomainNotifications({ connection, clock });

  async function enrichVisit(row, session) {
    const sitter = row.sitterId ? await col('users').findOne({ _id: row.sitterId },
      { session, projection: { displayName: 1 } }) : null;
    let hasCheckInPhoto = false;
    if (row.state === 'STAFF_CLOSED') {
      const checkInIds = (row.evidenceRefs ?? []).filter(item => item.kind === 'CHECK_IN' && MEDIA_ID.test(item.mediaId))
        .map(item => item.mediaId);
      if (checkInIds.length) {
        hasCheckInPhoto = Boolean(await col('privateimages').findOne({ _id: { $in: checkInIds }, state: 'READY',
          ownerId: row.sitterId, careVisitId: ref(row._id), careKind: 'CHECK_IN' }, { session, projection: { _id: 1 } }));
      }
    }
    return asVisit(row, { sitterName: sitter?.displayName ?? null, hasCheckInPhoto });
  }

  async function run(work, existingSession) {
    await assertFinanceSourceStorage(connection);
    const execute = async session => {
      async function getBooking(bookingId) {
        if (!oid(bookingId)) return null;
        return asBooking(await col('bookings').findOne({ _id: oid(bookingId) }, { session }));
      }

      async function getVisit(visitId) {
        if (!oid(visitId)) return null;
        const row = await col('visits').findOne({ _id: oid(visitId) }, { session });
        return row ? enrichVisit(row, session) : null;
      }

      async function getVisits(booking) {
        const rows = await col('visits').find({ bookingId: booking._id, state: { $ne: 'SUPERSEDED' } },
          { session, maxTimeMS: 5000 }).sort({ startAt: 1, _id: 1 }).limit(61).toArray();
        if (rows.length > 60) fail(503, 'COMPLAINT_UNAVAILABLE');
        const ids = new Set(rows.map(row => ref(row._id)));
        if (Array.isArray(booking.visitIds)) {
          for (const missing of booking.visitIds.filter(id => !ids.has(ref(id)))) {
            if (!await col('visits').findOne({ _id: missing, bookingId: booking._id, state: 'SUPERSEDED' }, { session })) {
              fail(503, 'COMPLAINT_UNAVAILABLE');
            }
          }
        }
        const result = [];
        for (const row of rows) result.push(await enrichVisit(row, session));
        return result;
      }

      async function changeHold(booking, complaintId, actorId, release = false) {
        await holds.change({ booking, actorId, lockType: 'CASE', reference: 'case:' + complaintId, release, session });
      }

      async function updateComplaint({ complaintId, expectedVersion, changes, resolution, objection, decision, actorId }) {
        const legacy = changes === undefined;
        const legacyFields = resolution ?? objection ?? decision;
        const values = changes ?? { ...legacyFields, ...(objection ? { latestObjection: objection, objectionCount: 1 } : {}),
          ...(decision ? { decision } : { resolution: legacyFields }) };
        const matchVersion = expectedVersion === 0 ? { $or: [
          { version: 0 }, { version: null, complaintSchemaVersion: { $ne: COMPLAINT_SCHEMA_VERSION } }
        ] } : { version: expectedVersion };
        const saved = await col('cases').findOneAndUpdate({ _id: complaintId, kind: 'COMPLAINT', ...matchVersion },
          { $set: { ...values, version: expectedVersion + 1 } }, { session, returnDocument: 'after' });
        if (!saved) fail(409, 'VERSION_CONFLICT');
        if (legacy) {
          const booking = await getBooking(ref(saved.bookingId));
          if (!booking) fail(404, 'RESOURCE_NOT_FOUND');
          await changeHold(booking, complaintId, actorId, decision?.state === 'CLOSED' && decision.financialHold === false);
        }
        return asCase(saved);
      }

      async function getComplaint(id) {
        const record = asCase(await col('cases').findOne({ _id: id, kind: 'COMPLAINT' }, { session }));
        if (!record) return null;
        return record;
      }

      return work({
        session, getBooking, getVisit, getVisits, getComplaint, updateComplaint, changeHold,
        guardBooking: async booking => asBooking(await finance.touch(booking, session)),
        getPhone: async id => phones ? (await phones.phonesOf([id])).get(id) ?? null : null,
        getCustomerName: async id => (await col('users').findOne({ _id: oid(id) },
          { session, projection: { displayName: 1 } }))?.displayName ?? null,
        bookingComplaints: async bookingId => {
          const rows = await col('cases').find({ bookingId: oid(bookingId), kind: 'COMPLAINT' },
            { session, maxTimeMS: 5000 }).limit(1001).toArray();
          if (rows.length > 1000) fail(503, 'COMPLAINT_UNAVAILABLE');
          return rows.map(asCase);
        },
        createComplaint: async input => {
          const row = { ...input, _id: input.id, visitId: oid(input.visitId), bookingId: oid(input.bookingId),
            customerId: oid(input.customerId), sitterId: oid(input.sitterId) };
          delete row.id;
          const sameLegacyPrefix = await col('cases').findOne({ _id: { $regex: '^' + row._id.slice(0, 13) },
            kind: 'COMPLAINT' }, { session, projection: { _id: 1 } });
          if (sameLegacyPrefix) fail(503, 'COMPLAINT_UNAVAILABLE');
          // The command collection already has a unique primary key. Claim the display code
          // in the same transaction without requiring a new index on existing deployments.
          await commands.create([{ _id: 'complaint-code:' + row.code, fingerprint: hash(row._id),
            result: { complaintId: row._id }, createdAt: row.createdAt }], { session });
          await col('cases').insertOne(row, { session });
          return asCase(row);
        },
        assertEvidence: async (refs, ownerId) => {
          if (!refs.length) return;
          const count = await col('privateimages').countDocuments({ _id: { $in: refs.map(item => item.mediaId) },
            state: 'READY', ownerId: oid(ownerId), contentType: { $in: ['image/jpeg', 'image/png'] } }, { session });
          if (count !== refs.length) fail(409, 'EVIDENCE_NOT_READY');
        },
        getIdempotencyResult: async identity => {
          const row = await commands.findById(key(identity)).session(session).lean();
          return row ? { payloadHash: row.fingerprint, result: row.result } : null;
        },
        saveIdempotencyResult: async ({ identity, payloadHash, result }) => commands.create([
          { _id: key(identity), fingerprint: payloadHash, result, createdAt: new Date(clock()) }
        ], { session }),
        recordEvent: async ({ event, record, actorId, at }) => {
          const eventId = 'complaint-event:' + record.id + ':' + record.version;
          await events.create([{ _id: eventId, type: event, resourceId: record.id, actorId, at }], { session });
          await notifications.complaint({ eventId, event, record }, session);
        }
      });
    };
    if (existingSession) {
      if (!existingSession.inTransaction()) fail(503, 'COMPLAINT_UNAVAILABLE');
      return execute(existingSession);
    }
    return unitOfWork.run(execute);
  }

  async function listComplaints({ actor, filter, limit, cursor, asOf }) {
    const staff = hasRole(actor.roles, 'STAFF'), sitter = hasRole(actor.roles, 'PET_SITTER');
    const stages = [{ $match: matchList(actor, filter) }, { $set: listFields() }];
    if (sitter) {
      stages.push(join('visits', 'visitId', 'visitRows', { sitterId: 1 }),
        { $match: { 'visitRows.sitterId': oid(actor.userId) } },
        { $set: { sitterState: { $switch: { branches: [
          { case: { $and: [{ $eq: ['$state', 'RESOLVED'] }, { $or: [
            { $and: [{ $eq: [{ $type: '$finalAt' }, 'date'] }, { $lte: ['$finalAt', asOf] }] },
            { $and: [{ $eq: [{ $type: '$appealUntil' }, 'date'] }, { $lte: ['$appealUntil', asOf] }, { $eq: ['$objectionCount', 0] }] }
          ] }] }, then: 'CLOSED' },
          { case: { $eq: ['$state', 'ESCALATED'] }, then: 'UNDER_REVIEW' }
        ], default: '$state' } } } });
    }
    stages.push(join('bookings', 'bookingId', 'bookingRows', { state: 1, version: 1, bookingCode: 1, code: 1, customerId: 1 }),
      { $set: { joinedBooking: { $first: '$bookingRows' } } });
    if (hasRole(actor.roles, 'CUSTOMER')) stages.push({ $match: { 'joinedBooking.customerId': oid(actor.userId) } });
    if (staff) stages.push(join('users', 'customerId', 'customerRows', { displayName: 1 }),
      { $set: { customerName: { $first: '$customerRows.displayName' } } });
    if (filter.q) {
      const needle = { $regex: escapeRegex(filter.q), $options: 'i' };
      stages.push({ $match: { $or: [{ displayCode: needle }, { rowId: needle }, { 'joinedBooking.code': needle },
        { 'joinedBooking.bookingCode': needle }, { displayBookingId: needle }, { customerName: needle }] } });
    }
    const context = { actorId: actor.userId, role: actor.roles[0], filter, limit };
    const page = pageStages({ filter, cursor, context, codec, limit, stateField: sitter ? 'sitterState' : 'displayState' });
    const facet = { items: [...page, join('visits', 'visitId', 'detailVisits', {
      state: 1, version: 1, startAt: 1, endAt: 1, 'snapshots.serviceName': 1, sitterId: 1
    })] };
    if (staff) facet.counts = [{ $group: { _id: '$displayState', count: { $sum: 1 } } }];
    const [result] = await col('cases').aggregate([...stages, { $facet: facet }], { maxTimeMS: 5000 }).toArray();
    const rows = result.items.slice(0, limit);
    const last = rows.at(-1);
    const items = rows.map(row => {
      const visit = row.detailVisits[0];
      return { ...asCase(row), bookingSummary: row.joinedBooking ? bookingSummary(asBooking(row.joinedBooking)) : null,
        visitSummary: visit ? visitSummary(asVisit(visit)) : null };
    });
    const counts = staff ? Object.assign({ OPEN: 0, ESCALATED: 0, RESOLVED: 0 },
      Object.fromEntries(result.counts.filter(row => ['OPEN', 'ESCALATED', 'RESOLVED'].includes(row._id)).map(row => [row._id, row.count]))) : null;
    return { items, nextCursor: result.items.length > limit
      ? codec.encode({ at: +last.submittedAt, id: last.rowId }, context) : null,
    ...(counts ? { counts } : {}) };
  }

  return { run, listComplaints, runForCase: (_actor, _id, work) => run(work) };
}
