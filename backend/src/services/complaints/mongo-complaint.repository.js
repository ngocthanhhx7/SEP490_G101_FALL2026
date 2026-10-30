import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createBookingFinancialHolds } from '../settlements/booking-financial-holds.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { hasRole } from '../../utils/roles.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
const fail = (status, code) => { throw new AppError(status, code, code); };
const key = identity => `complaint:${hash(identity)}`;

export function createMongoComplaintRepository({ connection, finance, cursorSecret }) {
  const { FinanceSourceCommand: commands, FinanceSourceEvent: events } = financeSourceModels(connection);
  const unitOfWork = createUnitOfWork(connection);
  const holds = createBookingFinancialHolds({ connection, finance });
  const col = name => connection.db.collection(name);
  const codec = createScopedCursor({ secret: cursorSecret, namespace: 'complaint-primary-v1' });
  const serialize = row => row ? { ...row, id: String(row._id), visitId: String(row.visitId),
    bookingId: String(row.bookingId), customerId: String(row.customerId), sitterId: String(row.sitterId) } : null;
  async function run(_actor, _resourceId, work) {
    await assertFinanceSourceStorage(connection);
    return unitOfWork.run(async session => {
      async function getVisit(visitId) {
        if (!oid(visitId)) return null;
        const visit = await col('visits').findOne({ _id: oid(visitId) }, { session });
        if (!visit) return null;
        const booking = await col('bookings').findOne({ _id: visit.bookingId }, { session });
        return booking ? { ...serialize({ ...visit, customerId: booking.customerId }), id: visitId, visitId } : null;
      }
      async function bookingFor(visitId) {
        const visit = await getVisit(visitId);
        const booking = visit ? await col('bookings').findOne({ _id: oid(visit.bookingId) }, { session }) : null;
        if (!booking) fail(404, 'RESOURCE_NOT_FOUND'); return booking;
      }
      async function hold({ complaintId, visitId, actorId }, release = false) {
        const booking = await bookingFor(visitId);
        await holds.change({ booking, actorId, lockType: 'CASE', reference: `case:${complaintId}`, release, session });
      }
      async function update({ complaintId, expectedVersion, resolution, objection, decision, actorId }) {
        const changes = resolution ?? objection ?? decision;
        const current = await col('cases').findOne({ _id: complaintId, kind: 'COMPLAINT', version: expectedVersion }, { session });
        if (!current) fail(409, 'VERSION_CONFLICT');
        const fields = { ...changes, version: expectedVersion + 1, ...(objection ? { latestObjection: objection, objectionCount: 1 } : {}),
          ...(decision ? { decision } : { resolution: changes }) };
        const saved = await col('cases').findOneAndUpdate({ _id: complaintId, version: expectedVersion },
          { $set: fields }, { session, returnDocument: 'after' });
        if (!saved) fail(409, 'VERSION_CONFLICT');
        // Every nonfinal state retains the hold, even when Staff has proposed a
        // resolution. Only an explicit audited Admin conclusion can release it.
        const release = decision?.state === 'CLOSED' && decision.financialHold === false;
        await hold({ complaintId, visitId: String(current.visitId), actorId }, release);
        return serialize(saved);
      }
      const tx = {
        getVisit,
        getComplaint: async id => serialize(await col('cases').findOne({ _id: id, kind: 'COMPLAINT' }, { session })),
        findOpenComplaint: async ({ visitId }) => serialize(await col('cases').findOne({ visitId: oid(visitId),
          kind: 'COMPLAINT', state: { $in: ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] } }, { session })),
        createComplaint: async input => {
          const visit = await getVisit(input.visitId);
          if (!visit || visit.customerId !== input.customerId) fail(404, 'RESOURCE_NOT_FOUND');
          const row = { ...input, _id: input.id, visitId: oid(input.visitId), bookingId: oid(visit.bookingId),
            customerId: oid(input.customerId), sitterId: oid(visit.sitterId) };
          delete row.id;
          for (const evidence of input.evidenceRefs) {
            const image = await col('privateimages').findOne({ _id: evidence.mediaId, state: 'READY',
              $or: [{ ownerId: oid(input.customerId) }, { careVisitId: input.visitId }] }, { session });
            if (!image) fail(409, 'EVIDENCE_NOT_READY');
          }
          // Sharing the Booking guard prevents two open-case inserts and an
          // accrual/reservation from committing from incompatible snapshots.
          const existing = await col('cases').findOne({ visitId: row.visitId, kind: 'COMPLAINT',
            state: { $in: ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] } }, { session });
          if (existing) fail(409, 'COMPLAINT_ALREADY_OPEN');
          await col('cases').insertOne(row, { session });
          await hold({ complaintId: input.id, visitId: input.visitId, actorId: input.actorId });
          return serialize(row);
        },
        updateComplaint: update,
        holdSettlement: input => hold(input), releaseSettlementHold: input => hold(input, true),
        getIdempotencyResult: async identity => {
          const row = await commands.findById(key(identity)).session(session).lean();
          return row ? { payloadHash: row.fingerprint, result: row.result } : null;
        },
        saveIdempotencyResult: async ({ identity, payloadHash, result }) => commands.create([
          { _id: key(identity), fingerprint: payloadHash, result, createdAt: new Date() }
        ], { session }),
        appendAuditAndOutbox: async input => events.create([{ _id: `complaint-event:${hash(input)}`, type: input.type,
          resourceId: input.complaintId, actorId: input.actorId, at: new Date(input.at) }], { session })
      };
      return work(tx);
    });
  }
  return { runForVisitActor: run, runForCase: run,
    async listComplaints({ actor, filter, limit, cursor }) {
      const match = { kind: 'COMPLAINT' };
      if (!hasRole(actor.roles, 'STAFF')) {
        match.$or = [];
        if (hasRole(actor.roles, 'CUSTOMER')) match.$or.push({ customerId: oid(actor.userId) });
        if (hasRole(actor.roles, 'PET_SITTER')) match.$or.push({ sitterId: oid(actor.userId) });
        if (!match.$or.length) fail(403, 'FORBIDDEN');
      }
      if (filter.visitId) { if (!oid(filter.visitId)) fail(422, 'VALIDATION_FAILED'); match.visitId = oid(filter.visitId); }
      if (filter.state) match.state = filter.state;
      if (filter.category) match.category = filter.category;
      const context = { actorId: actor.userId, roles: [...actor.roles].sort(), filter, limit };
      if (cursor) {
        const position = codec.decode(cursor, context);
        if (typeof position.id !== 'string' || !/^[a-f0-9-]{36}$/.test(position.id)) fail(422, 'VALIDATION_FAILED');
        match._id = { $gt: position.id };
      }
      const rows = await col('cases').find(match, { maxTimeMS: 5000 }).sort({ _id: 1 }).limit(limit + 1).toArray();
      const items = rows.slice(0, limit).map(serialize);
      return { items, nextCursor: rows.length > limit ? codec.encode({ id: items.at(-1).id }, context) : null };
    }
  };
}
