import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createMongoEarningSources } from './mongo-earning-sources.repository.js';
import { createEarningAccrualService } from './earning-accrual.service.js';
import { assertFinanceSourceStorage } from './source-provisioning.js';
import { recordEmployeeServiceCompletion } from '../payroll/completion-payroll-source.service.js';
import { assertPayrollStorage } from '../payroll/payroll-storage.service.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (status, code) => { throw new AppError(status, code, code); };
const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
  ? new Types.ObjectId(value) : fail(422, 'VALIDATION_FAILED');

// Only canonical primary rows are read here. No command accepts an earning,
// fee, completion instant, eligibility flag or payment amount from a browser.
export function createBookingFinanceSourceService({ connection, clock = () => new Date(), compensationModel = 'EMPLOYEE' }) {
  if (!['EMPLOYEE', 'LEGACY_PARTNER'].includes(compensationModel)) throw new TypeError('Invalid compensation model');
  const storage = financeSourceModels(connection);
  const unitOfWork = createUnitOfWork(connection);
  const sources = createMongoEarningSources({ connection });
  const accrual = createEarningAccrualService({ connection, unitOfWork, sources, clock });
  const statuses = sitterApplicationModels(connection).SitterStatus;
  const col = name => connection.db.collection(name);
  const now = () => { const value = new Date(clock()); if (!Number.isFinite(value.getTime())) throw new TypeError('Invalid source clock'); return value; };

  async function retry(work) {
    for (let attempt = 0; ; attempt++) {
      try { return await unitOfWork.run(work); }
      catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  async function enqueue(booking, session) {
    if (compensationModel === 'EMPLOYEE') return;
    const visits = await col('visits').find({ bookingId: booking._id, _id: { $in: booking.visitIds } }, { session }).limit(61).toArray();
    for (const sitterId of [...new Set(visits.filter(row => row.sitterId).map(row => String(row.sitterId)))].sort()) {
      const at = now();
      await storage.EarningAccrualTask.updateOne({ _id: digest([String(booking._id), sitterId]) },
        { $set: { bookingId: String(booking._id), sitterId, state: 'PENDING', nextAttemptAt: at, updatedAt: at },
          $inc: { revision: 1 } }, { upsert: true, session });
    }
  }
  async function event(type, booking, actorId, resourceId, session) {
    const at = now();
    await storage.FinanceSourceEvent.create([{ _id: digest([type, resourceId]), type,
      bookingId: String(booking._id), actorId, resourceId, at }], { session });
  }
  async function touch(booking, session, fields = {}) {
    if (!Number.isSafeInteger(booking.version) || booking.version < 0) fail(409, 'SOURCE_RECONCILIATION_REQUIRED');
    const result = await col('bookings').findOneAndUpdate({ _id: booking._id, version: booking.version },
      { $inc: { version: 1, financeGuardVersion: 1 }, $set: fields }, { session, returnDocument: 'after' });
    if (!result) fail(409, 'VERSION_CONFLICT');
    return result;
  }
  function actor(actor, role) {
    if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles) || actor.synthetic === true
      || (actor.expiresAt !== undefined && actor.expiresAt <= now().getTime())) fail(401, 'UNAUTHENTICATED');
    oid(actor.userId);
    if (!actor.roles.includes(role)) fail(403, 'FORBIDDEN');
  }
  async function command({ actor: current, operation, resourceId, expectedVersion, idempotencyKey, payload, authorize, work }) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0
      || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(idempotencyKey)) fail(422, 'VALIDATION_FAILED');
    const key = digest([current.userId, operation, resourceId, idempotencyKey]);
    const fingerprint = digest({ expectedVersion, payload });
    await assertFinanceSourceStorage(connection);
    if (compensationModel === 'EMPLOYEE') await assertPayrollStorage(connection);
    return retry(async session => {
      const context = await authorize(session);
      const previous = await storage.FinanceSourceCommand.findById(key).session(session).lean();
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_KEY_REUSED');
        return previous.result;
      }
      const result = await work(context, session);
      await storage.FinanceSourceCommand.create([{ _id: key, fingerprint, result, createdAt: now() }], { session });
      return result;
    });
  }
  async function visitContext(current, visitId, session) {
    const visit = await col('visits').findOne({ _id: oid(visitId), sitterId: oid(current.userId) }, { session });
    if (!visit) fail(404, 'RESOURCE_NOT_FOUND');
    const status = await statuses.findOne({ userId: oid(current.userId), status: 'ACTIVE' }).session(session).lean();
    if (!status) fail(403, 'SITTER_NOT_ACTIVE');
    const booking = await col('bookings').findOne({ _id: visit.bookingId }, { session });
    if (!booking || !Array.isArray(booking.visitIds) || booking.visitIds.length !== booking.originalVisitCount
      || booking.visitIds.length < 1 || booking.visitIds.length > 60
      || new Set(booking.visitIds.map(String)).size !== booking.visitIds.length
      || !booking.visitIds.some(id => String(id) === visitId)
      || !['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.state)) fail(409, 'INVALID_STATE');
    if (booking.originalVisitCount > 1 && booking.paymentMode !== 'PREPAY') fail(409, 'PREPAYMENT_REQUIRED');
    return { visit, booking };
  }
  async function bindMedia(mediaId, visit, current, kind, session) {
    if (typeof mediaId !== 'string' || !/^[a-f0-9]{64}$/.test(mediaId)) fail(422, 'VALIDATION_FAILED');
    const image = await col('privateimages').findOne({ _id: mediaId, ownerId: oid(current.userId), state: 'READY' }, { session });
    if (!image || !/^[a-f0-9]{64}$/.test(image.contentDigest ?? '') || !Number.isSafeInteger(image.byteLength)
      || image.byteLength < 1 || image.byteLength > 5 * 1024 * 1024) fail(409, 'EVIDENCE_NOT_READY');
    if (await storage.CareMediaBinding.exists({ _id: mediaId }).session(session)) fail(409, 'EVIDENCE_ALREADY_USED');
    await storage.CareMediaBinding.create([{ _id: mediaId, visitId: String(visit._id), kind,
      ownerId: current.userId, contentDigest: image.contentDigest, createdAt: now() }], { session });
    // Media consumers serialize on the same image row as other attachment writers.
    const bound = await col('privateimages').updateOne({ _id: mediaId, state: 'READY', careVisitId: { $exists: false },
      transferEvidenceRequestId: { $exists: false } }, { $set: { careVisitId: String(visit._id), careKind: kind } }, { session });
    if (!bound.matchedCount) fail(409, 'EVIDENCE_ALREADY_USED');
  }
  async function completeWholeBooking(booking, session) {
    const visits = await col('visits').find({ bookingId: booking._id, _id: { $in: booking.visitIds } }, { session }).limit(61).toArray();
    if (visits.length !== booking.originalVisitCount || visits.some(row => row.state !== 'COMPLETED')) return;
    const completed = await touch(booking, session, { state: 'COMPLETED', completedAt: now() });
    if (compensationModel === 'EMPLOYEE') {
      await recordEmployeeServiceCompletion({ connection, visits, session });
      await event('BookingCompleted', completed, null, String(booking._id), session);
      return;
    }
    for (const sitterId of [...new Set(visits.map(row => String(row.sitterId)))].sort()) {
      await accrual.recognizeCompletion({ bookingId: String(booking._id), sitterId, session });
    }
    await enqueue(completed, session);
    await event('BookingCompleted', completed, null, String(booking._id), session);
  }
  async function executeVisit({ actor: current, visitId, expectedVersion, idempotencyKey, operation, mediaId, items }) {
    actor(current, 'PET_SITTER'); oid(visitId);
    return command({ actor: current, operation, resourceId: visitId, expectedVersion, idempotencyKey,
      payload: { mediaId, items }, authorize: session => visitContext(current, visitId, session),
      work: async ({ visit, booking }, session) => {
        if (!['ASSIGNED', 'IN_PROGRESS'].includes(booking.state)) fail(409, 'INVALID_STATE');
        if (visit.version !== expectedVersion) fail(409, 'VERSION_CONFLICT');
        const at = now();
        let fields;
        if (operation === 'CHECK_IN') {
          if (visit.state !== 'ASSIGNED' || visit.checkInAt) fail(409, 'INVALID_STATE');
          if (!(visit.startAt instanceof Date) || !(visit.endAt instanceof Date)
            || visit.endAt <= visit.startAt) fail(409, 'SOURCE_RECONCILIATION_REQUIRED');
          if (at.getTime() < visit.startAt.getTime() - 30 * 60 * 1000) fail(409, 'CHECK_IN_TOO_EARLY');
          if (at > visit.endAt) fail(409, 'INVALID_STATE');
          if (visit.handoverRequired && visit.handoverAccepted !== true) fail(409, 'HANDOVER_REQUIRED');
          if (booking.originalVisitCount > 1) {
            const receipt = await col('payments').find({ bookingId: booking._id, state: 'VERIFIED' }, { session }).limit(2).toArray();
            if (receipt.length !== 1) fail(409, 'PREPAYMENT_REQUIRED');
            const priceVisits = await col('visits').find({ bookingId: booking._id, _id: { $in: booking.visitIds } }, { session }).limit(61).toArray();
            if (priceVisits.length !== booking.originalVisitCount || priceVisits.some(row => !Number.isSafeInteger(row.snapshots?.serviceBasisVnd) || row.snapshots.serviceBasisVnd < 0)) fail(409, 'SOURCE_RECONCILIATION_REQUIRED');
            const paid = receipt[0];
            const paymentSnapshot = booking.paymentSnapshot;
            if (compensationModel === 'EMPLOYEE' && (paymentSnapshot?.currency !== 'VND' ||
              !Number.isSafeInteger(paymentSnapshot?.amountVnd) || paymentSnapshot.amountVnd < 0)) fail(409, 'SOURCE_RECONCILIATION_REQUIRED');
            const expected = compensationModel === 'EMPLOYEE' ? BigInt(paymentSnapshot.amountVnd)
              : priceVisits.reduce((sum, row) => sum + BigInt(row.snapshots.serviceBasisVnd), 0n);
            if (paid.receiptMoney?.currency !== 'VND' || !Number.isSafeInteger(paid.receiptMoney?.amountVnd)
              || BigInt(paid.receiptMoney.amountVnd) !== expected || !(paid.verifiedAt instanceof Date)) fail(409, 'PREPAYMENT_REQUIRED');
          }
          await bindMedia(mediaId, visit, current, operation, session);
          fields = { state: 'IN_PROGRESS', checkInAt: at };
        } else {
          if (visit.state !== 'IN_PROGRESS' || !(visit.checkInAt instanceof Date)) fail(409, 'INVALID_STATE');
          if (operation === 'CHECKLIST') {
            const required = visit.snapshots?.checklistItemIds;
            if (!Array.isArray(required) || required.length > 100 || new Set(required).size !== required.length
              || !Array.isArray(items) || items.length !== required.length
              || new Set(items.map(row => row?.itemId)).size !== items.length
              || items.some(row => !required.includes(row?.itemId) || !['DONE', 'SKIPPED'].includes(row.status)
                || (row.status === 'SKIPPED' && (typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 1000)))) fail(422, 'CHECKLIST_INVALID');
            fields = { checklist: items.map(row => ({ itemId: row.itemId, status: row.status,
              ...(row.status === 'SKIPPED' ? { reason: row.reason.trim() } : {}) })) };
          } else {
            if (!(visit.endAt instanceof Date) || at.getTime() > visit.endAt.getTime() + 2 * 60 * 60 * 1000
              || at < visit.checkInAt) fail(409, 'CHECK_OUT_DEADLINE_PASSED');
            const required = visit.snapshots?.checklistItemIds;
            if (!Array.isArray(required) || !Array.isArray(visit.checklist) || required.length !== visit.checklist.length
              || required.some(id => !visit.checklist.some(row => row.itemId === id && ['DONE', 'SKIPPED'].includes(row.status)
                && (row.status !== 'SKIPPED' || row.reason?.trim())))) fail(409, 'CHECKLIST_REQUIRED');
            await bindMedia(mediaId, visit, current, operation, session);
            fields = { state: 'COMPLETED', checkOutAt: at, completedAt: at };
          }
        }
        const update = { $set: fields, $inc: { version: 1 } };
        if (operation !== 'CHECKLIST') update.$push = { evidenceRefs: { kind: operation, mediaId } };
        const saved = await col('visits').findOneAndUpdate({ _id: visit._id, version: expectedVersion, sitterId: visit.sitterId },
          update, { session, returnDocument: 'after' });
        if (!saved) fail(409, 'VERSION_CONFLICT');
        const updatedBooking = await touch(booking, session, { state: 'IN_PROGRESS' });
        if (operation === 'CHECK_OUT') await completeWholeBooking(updatedBooking, session);
        await event(`Visit${operation}`, updatedBooking, current.userId, `${visitId}:${saved.version}`, session);
        return { visitId, state: saved.state, version: saved.version };
      } });
  }
  async function confirmAssessment({ actor: current, bookingId, expectedVersion, idempotencyKey, totalTaxVnd, evidenceReference }) {
    actor(current, 'ADMIN'); oid(bookingId);
    if (!Number.isSafeInteger(totalTaxVnd) || totalTaxVnd < 0 || typeof evidenceReference !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(evidenceReference)) fail(422, 'VALIDATION_FAILED');
    return command({ actor: current, operation: 'CONFIRM_TAX', resourceId: bookingId, expectedVersion, idempotencyKey,
      payload: { totalTaxVnd, evidenceReference }, authorize: async session => {
        const booking = await col('bookings').findOne({ _id: oid(bookingId) }, { session });
        if (!booking) fail(404, 'RESOURCE_NOT_FOUND'); return booking;
      }, work: async (booking, session) => {
        if (booking.version !== expectedVersion) fail(409, 'VERSION_CONFLICT');
        if (!['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.state)) fail(409, 'INVALID_STATE');
        if (await col('taxassessments').findOne({ bookingId: booking._id }, { session })) fail(409, 'ASSESSMENT_ALREADY_CONFIRMED');
        const at = now(), id = new Types.ObjectId();
        await col('taxassessments').insertOne({ _id: id, bookingId: booking._id, state: 'CONFIRMED', totalTaxVnd,
          confirmedBy: oid(current.userId), confirmedAt: at, evidenceReference, version: 0 }, { session });
        const updated = await touch(booking, session);
        await enqueue(updated, session);
        await event('TaxAssessmentConfirmed', booking, current.userId, String(id), session);
        return { bookingId, assessmentId: String(id), totalTaxVnd, state: 'CONFIRMED', bookingVersion: updated.version };
      } });
  }
  async function drain({ limit = 25 } = {}) {
    if (compensationModel === 'EMPLOYEE') return [];
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Bounded accrual batch required');
    await assertFinanceSourceStorage(connection);
    const tasks = await storage.EarningAccrualTask.find({ state: 'PENDING', nextAttemptAt: { $lte: now() } })
      .sort({ nextAttemptAt: 1, _id: 1 }).limit(limit).lean();
    const results = [];
    for (const task of tasks) {
      let fields;
      try {
        await accrual.accrue({ bookingId: task.bookingId, sitterId: task.sitterId });
        fields = { state: 'DONE', lastCode: 'ACCRUED' };
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        fields = { lastCode: error.code, nextAttemptAt: new Date(now().getTime() + 60000) };
      }
      await storage.EarningAccrualTask.updateOne({ _id: task._id, revision: task.revision }, { $set: { ...fields, updatedAt: now() } });
      results.push({ bookingId: task.bookingId, sitterId: task.sitterId, code: fields.lastCode });
    }
    return results;
  }
  return Object.freeze({
    checkIn: input => executeVisit({ ...input, operation: 'CHECK_IN' }),
    updateChecklist: input => executeVisit({ ...input, operation: 'CHECKLIST' }),
    checkOut: input => executeVisit({ ...input, operation: 'CHECK_OUT' }),
    confirmAssessment, drain, enqueue, touch
  });
}
