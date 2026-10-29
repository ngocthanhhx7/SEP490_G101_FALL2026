import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { allocateBookingReceipt } from './booking-allocation.js';

const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const versioned = row => row && Number.isSafeInteger(row.version) && row.version >= 0;

// Reads primary P01 collections; never creates them or accepts HTTP snapshots.
// Every writer affecting these facts must touch the same Booking.version guard.
export function createMongoEarningSources({ connection }) {
  const db = connection.db;
  if (!db?.collection) throw new TypeError('Operational database required');
  const collection = name => db.collection(name);
  async function completion({ bookingId, sitterId, session }) {
    const id = oid(bookingId), sitter = oid(sitterId);
    if (!id || !sitter || !session) return null;
    const booking = await collection('bookings').findOne({ _id: id, state: 'COMPLETED' }, { session });
    if (!versioned(booking) || !(booking.completedAt instanceof Date)
      || !Array.isArray(booking.visitIds) || booking.visitIds.length < 1 || booking.visitIds.length > 60
      || new Set(booking.visitIds.map(String)).size !== booking.visitIds.length
      || booking.visitIds.length !== booking.originalVisitCount) return null;
    if (booking.originalVisitCount > 1 && booking.paymentMode !== 'PREPAY') return null;
    const visits = await collection('visits').find({ _id: { $in: booking.visitIds }, bookingId: id }, { session }).limit(61).toArray();
    if (visits.length !== booking.visitIds.length || visits.some(visit => !versioned(visit) || visit.state !== 'COMPLETED'
      || !visit.sitterId || !(visit.completedAt instanceof Date) || visit.completedAt > booking.completedAt
      || !Array.isArray(visit.evidenceRefs) || visit.evidenceRefs.length > 20
      || visit.evidenceRefs.filter(evidence => evidence.kind === 'CHECK_OUT').length !== 1
      || visit.evidenceRefs.filter(evidence => evidence.kind === 'CHECK_IN').length !== 1)
      || !visits.some(visit => String(visit.sitterId) === sitterId)) return null;
    const evidence = visits.flatMap(visit => visit.evidenceRefs.filter(row => ['CHECK_IN', 'CHECK_OUT'].includes(row.kind))
      .map(row => ({ ...row, sitterId: visit.sitterId, visitId: visit._id })));
    if (evidence.some(item => !/^[a-f0-9]{64}$/.test(item.mediaId ?? ''))) return null;
    const images = await collection('privateimages').find({ _id: { $in: evidence.map(item => item.mediaId) },
      state: 'READY' }, { session }).limit(121).toArray();
    for (const item of evidence) {
      const media = images.find(image => image._id === item.mediaId && String(image.ownerId) === String(item.sitterId));
      if (!media || !/^[a-f0-9]{64}$/.test(media.contentDigest ?? '') || !Number.isSafeInteger(media.byteLength)
        || media.byteLength < 1 || media.byteLength > 5 * 1024 * 1024) return null;
    }
    const fingerprint = hash({ bookingId, completedAt: booking.completedAt.toISOString(),
      visits: [...visits].sort((a, b) => String(a._id).localeCompare(String(b._id))).map(visit => ({
        id: String(visit._id), sitterId: String(visit.sitterId), completedAt: visit.completedAt.toISOString(),
        evidence: visit.evidenceRefs.filter(row => ['CHECK_IN', 'CHECK_OUT'].includes(row.kind)).map(row => [row.kind, row.mediaId]).sort()
      })) });
    return { booking, visits, bookingId, sitterId, bookingState: 'COMPLETED', completionVerified: true,
      completedAt: booking.completedAt.toISOString(), completionReference: `booking-completion:${fingerprint}` };
  }
  async function readCompletion(input) {
    const result = await completion(input);
    if (!result) return null;
    return { bookingId: result.bookingId, sitterId: result.sitterId, bookingState: result.bookingState,
      completionVerified: result.completionVerified, completedAt: result.completedAt,
      completionReference: result.completionReference };
  }
  async function readBooking(input) {
    const result = await completion(input);
    if (!result) return null;
    const { booking, visits, ...projection } = result;
    const session = input.session;
    const receipts = await collection('payments').find({ bookingId: booking._id, state: 'VERIFIED' }, { session }).limit(2).toArray();
    const assessments = await collection('taxassessments').find({ bookingId: booking._id, state: 'CONFIRMED' }, { session }).limit(2).toArray();
    if (receipts.length !== 1 || assessments.length !== 1 || !versioned(receipts[0]) || !versioned(assessments[0])) return null;
    const receipt = receipts[0], assessment = assessments[0];
    if (!(receipt.verifiedAt instanceof Date) || !receipt.intentId || !receipt.provider || !receipt.providerEventId
      || !assessment.confirmedBy || !(assessment.confirmedAt instanceof Date) || !assessment.evidenceReference) return null;
    const holds = await collection('cases').find({ visitId: { $in: booking.visitIds }, state: { $in: ['OPEN', 'UNDER_REVIEW'] } }, { session })
      .project({ _id: 1 }).limit(101).toArray();
    const refunds = await collection('refunds').find({ bookingId: booking._id,
      state: { $in: ['PROPOSED', 'APPROVED', 'TRANSFER_PENDING', 'FAILED'] } }, { session }).project({ _id: 1 }).limit(101).toArray();
    if (holds.length > 100 || refunds.length > 100) return null;
    const needed = ['bookings', 'visits', 'payments', 'taxassessments', 'cases', 'refunds', 'privateimages'];
    const present = await db.listCollections({ name: { $in: needed } }, { nameOnly: true }).toArray();
    if (needed.some(name => !present.some(row => row.name === name))) return null;
    let allocation;
    try {
      allocation = allocateBookingReceipt({ bookingId: input.bookingId,
        visits: visits.map(visit => ({ visitId: String(visit._id), sitterId: String(visit.sitterId), serviceBasisVnd: visit.snapshots?.serviceBasisVnd })),
        receipt: { id: String(receipt._id), bookingId: input.bookingId, verified: true,
          currency: receipt.receiptMoney?.currency, serviceAmountVnd: receipt.receiptMoney?.amountVnd },
        assessment: { id: String(assessment._id), bookingId: input.bookingId, confirmed: true, totalTaxVnd: assessment.totalTaxVnd } });
    } catch { return null; }
    const sitter = allocation.sitters.find(row => row.sitterId === input.sitterId);
    if (!sitter) return null;
    return { ...projection, paymentVerified: true, allocationVerified: true, assessmentConfirmed: true, currency: 'VND',
      serviceBasisVnd: sitter.serviceBasisVnd, confirmedTaxVnd: sitter.confirmedTaxVnd,
      holdReferences: [...holds.map(row => `case:${row._id}`), ...refunds.map(row => `refund:${row._id}`)].sort(),
      paymentReference: String(receipt._id), assessmentReference: String(assessment._id),
      allocationReference: `visit-allocation:${allocation.sourceHash}`,
      sourceVersion: hash({ bookingVersion: booking.version, visitVersions: visits.map(row => [String(row._id), row.version]).sort(),
        receiptVersion: receipt.version, assessmentVersion: assessment.version, allocation: allocation.sourceHash }) };
  }
  return Object.freeze({ readCompletion, readBooking,
    async guardBooking({ bookingId, sitterId, sourceVersion, session }) {
      const current = await readBooking({ bookingId, sitterId, session });
      if (!current || current.sourceVersion !== sourceVersion || current.holdReferences.length) return false;
      const booking = await collection('bookings').findOne({ _id: oid(bookingId) }, { session });
      if (!versioned(booking)) return false;
      return (await collection('bookings').updateOne({ _id: booking._id, version: booking.version, state: 'COMPLETED' },
        { $inc: { financeGuardVersion: 1 } }, { session })).matchedCount === 1;
    }
  });
}
