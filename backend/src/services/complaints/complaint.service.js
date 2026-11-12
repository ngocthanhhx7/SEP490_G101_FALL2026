import { createHash, randomUUID } from 'node:crypto';
import { hasRole, isSingleRole } from '../../utils/roles.js';
import { AppError } from '../../utils/app-error.js';
import {
  complaintId, commandKey, invalid, MEDIA_ID, normalizeDecision, normalizeList,
  normalizeObjection, normalizeRefundDecision, normalizeResolution, normalizeReview, normalizeSubmission, submissionTarget, version
} from '../../validators/complaint.validator.js';
import {
  APPEAL_WINDOW_MS, COMPLAINT_SCHEMA_VERSION, COMPLAINT_WINDOW_MS, complaintFinalAt, complaintState,
  instant, visitCompletion
} from './complaint-lifecycle.js';
import { bookingSummary, complaintCode, safeComplaint, visitSummary } from './complaint-projection.js';
import { legacyCommandFingerprint, legacySubmitFingerprint } from './complaint-legacy-replay.js';

const fail = (status, code, message, details) => { throw new AppError(status, code, message, details); };
const notFound = () => fail(404, 'RESOURCE_NOT_FOUND', 'Complaint resource not found');
const unavailable = () => fail(503, 'BILLING_SOURCE_UNAVAILABLE', 'An authoritative booking bill source is unavailable');
const conflict = (code = 'INVALID_STATE', details) => fail(409, code, 'The complaint action is not available', details);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isHomeCare = visit => ['HOME', 'OUTDOOR'].includes(visit.location ?? 'HOME') && visit.snapshots?.boarding !== true;
const money = value => Number.isSafeInteger(value) && value >= 0;

function authenticate(actor, asOf) {
  if (!actor || actor.state !== 'ACTIVE' || actor.synthetic || typeof actor.userId !== 'string'
    || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= +asOf) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}

function authorizeRole(actor, role) {
  if (!hasRole(actor.roles, role)) fail(403, 'FORBIDDEN', 'Complaint action is forbidden');
}

function authorizeRead(actor, record, booking, visit) {
  if (hasRole(actor.roles, 'STAFF')) return;
  if (hasRole(actor.roles, 'CUSTOMER') && booking.customerId === actor.userId) return;
  if (hasRole(actor.roles, 'PET_SITTER') && visit?.sitterId === actor.userId
    && (!record.sitterId || record.sitterId === actor.userId)) return;
  notFound();
}

function enforceEligibility(eligibility) {
  const { eligible, reason, messageCode } = eligibility;
  if (eligible) return;
  if (reason === 'BILLING_SOURCE_UNAVAILABLE') unavailable();
  if (reason === 'COMPLAINT_UNAVAILABLE') fail(503, reason, 'Complaint eligibility is unavailable');
  conflict(reason, messageCode ? { messageCode } : undefined);
}

function deadline(at, asOf, open, ineligible) {
  if (ineligible) return { eligible: false, reason: ineligible, deadlineAt: null };
  if (!at) return { eligible: false, reason: 'COMPLAINT_UNAVAILABLE', deadlineAt: null };
  const deadlineAt = new Date(+at + COMPLAINT_WINDOW_MS).toISOString();
  if (asOf < at) return { eligible: false, reason: 'VISIT_NOT_COMPLETE', deadlineAt };
  if (+asOf > Date.parse(deadlineAt)) {
    return { eligible: false, reason: 'COMPLAINT_WINDOW_EXPIRED', messageCode: 'MSG41', deadlineAt };
  }
  if (open) return { eligible: false, reason: 'COMPLAINT_ALREADY_OPEN', messageCode: 'MSG42', deadlineAt };
  return { eligible: true, reason: null, deadlineAt };
}

function isOpen(records, visitId, asOf) {
  return records.some(record => (record.visitId ?? null) === visitId && !complaintFinalAt(record, asOf));
}

function visitEligibility(visit, records, asOf) {
  const completion = visitCompletion(visit);
  return deadline(completion?.at, asOf, isOpen(records, visit.id, asOf),
    isHomeCare(visit) && completion?.done ? null : 'VISIT_NOT_ELIGIBLE');
}

function checkCap(basis, amountVnd) {
  if (amountVnd > basis.remainingVnd) {
    fail(422, 'REFUND_CAP_EXCEEDED', 'Amount exceeds the remaining booking bill', {
      messageCode: 'MSG44', remainingVnd: basis.remainingVnd
    });
  }
}

export function createComplaintService({ repository, billing, readImage, clock = Date.now }) {
  if (!repository || typeof repository.run !== 'function') throw new TypeError('Complaint repository is required');

  function now() {
    const asOf = new Date(clock());
    if (!Number.isFinite(+asOf)) throw new TypeError('Invalid complaint clock');
    return asOf;
  }

  async function run(work, session) {
    try { return await repository.run(work, session); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'COMPLAINT_UNAVAILABLE', 'Complaint storage is unavailable');
    }
  }

  async function readBasis(tx, bookingId, replacingVnd = 0) {
    const basis = await billing?.read?.({ bookingId, session: tx.session });
    if (!basis || !['ISSUED', 'EXPECTED'].includes(basis.basis) || !money(basis.basisAmountVnd)
      || !money(basis.approvedTotalVnd) || basis.approvedTotalVnd < replacingVnd || typeof basis.paidInFull !== 'boolean'
      || (basis.paidInFull && basis.basis !== 'ISSUED')) unavailable();
    return {
      ...basis, remainingVnd: Math.max(0, basis.basisAmountVnd - (basis.approvedTotalVnd - replacingVnd))
    };
  }

  async function bookingEligibility(tx, booking, visits, records, asOf) {
    if (!visits.length || visits.some(visit => !isHomeCare(visit))) {
      return deadline(null, asOf, false, 'BOOKING_NOT_ELIGIBLE');
    }
    const completions = visits.map(visitCompletion);
    if (completions.some(value => !value)) return deadline(null, asOf, false, 'BOOKING_NOT_ENDED');
    const endedAt = completions.every(value => value.at) ? new Date(Math.max(...completions.map(value => +value.at))) : null;
    const eligibility = deadline(endedAt, asOf, isOpen(records, null, asOf));
    if (!eligibility.eligible || completions.some(value => value.done)) return eligibility;
    try {
      const basis = await readBasis(tx, booking.id);
      if (basis.basis !== 'ISSUED' || !money(basis.billTotalVnd)) unavailable();
      if (basis.billTotalVnd > 0) return eligibility;
      return { ...eligibility, eligible: false, reason: 'BOOKING_NOT_ELIGIBLE' };
    } catch (error) {
      if (error.code !== 'BILLING_SOURCE_UNAVAILABLE') throw error;
      return { ...eligibility, eligible: false, reason: error.code };
    }
  }

  async function loadBooking(tx, bookingId) {
    const booking = await tx.getBooking(bookingId);
    if (!booking) notFound();
    return booking;
  }

  async function loadCase(tx, actor, complaintIdValue) {
    const record = await tx.getComplaint(complaintIdValue);
    if (!record) notFound();
    const visit = record.visitId ? await tx.getVisit(record.visitId) : null;
    if (record.visitId && (!visit || visit.bookingId !== record.bookingId)) notFound();
    const booking = await loadBooking(tx, record.bookingId);
    authorizeRead(actor, record, booking, visit);
    return { record, booking, visit };
  }

  function asResult(record, actor, asOf, messageCode) {
    const complaint = safeComplaint(record, actor, asOf);
    return { complaint, case: complaint, complaintId: complaint.id, visitId: complaint.visitId,
      state: complaint.state, version: complaint.version, ...(messageCode ? { messageCode } : {}) };
  }

  function replay(prior, fingerprint) {
    if (prior && prior.payloadHash !== fingerprint) conflict('IDEMPOTENCY_CONFLICT');
    return prior?.result;
  }

  async function commitEvent(tx, { identity, fingerprint, record, actor, asOf, event, messageCode }) {
    const result = asResult(record, actor, asOf, messageCode);
    await tx.recordEvent({ event, record, actorId: actor.userId, at: asOf });
    await tx.saveIdempotencyResult({ identity, payloadHash: fingerprint, result });
    return result;
  }

  async function submit({ actor, expectedVersion, idempotencyKey, ...input }) {
    authenticate(actor, now());
    authorizeRole(actor, 'CUSTOMER');
    const target = submissionTarget(input);
    const expected = version(expectedVersion, true);
    const key = commandKey(idempotencyKey);
    const operation = target.scope === 'BOOKING' ? 'COMPLAINT_SUBMIT_BOOKING' : 'COMPLAINT_SUBMIT';
    const identity = { actorRef: actor.userId, resourceRef: target.visitId ?? target.bookingId, operation, key };
    const legacyFingerprint = legacySubmitFingerprint(input, expected);
    return run(async tx => {
      const asOf = now();
      const visit = target.visitId ? await tx.getVisit(target.visitId) : null;
      if (target.visitId && !visit) notFound();
      const booking = await loadBooking(tx, target.bookingId ?? visit?.bookingId);
      if (booking.customerId !== actor.userId || (visit && visit.bookingId !== booking.id)) notFound();
      const previous = await tx.getIdempotencyResult(identity);
      if (previous && previous.payloadHash === legacyFingerprint) return previous.result;
      const payload = { ...target, ...normalizeSubmission(input) };
      const fingerprint = legacyFingerprint ?? hash({ payload, expected });
      const prior = replay(previous, fingerprint);
      if (prior) return prior;
      if (expected !== null && (visit ?? booking).version !== expected) conflict('VERSION_CONFLICT');
      const records = await tx.bookingComplaints(booking.id);
      const eligibility = visit ? visitEligibility(visit, records, asOf)
        : await bookingEligibility(tx, booking, await tx.getVisits(booking), records, asOf);
      enforceEligibility(eligibility);
      await tx.assertEvidence(payload.evidenceRefs, actor.userId);
      const id = randomUUID();
      await tx.changeHold(booking, id, actor.userId);
      const record = await tx.createComplaint({
        id, kind: 'COMPLAINT', complaintSchemaVersion: COMPLAINT_SCHEMA_VERSION, code: complaintCode(id),
        ...payload, bookingId: booking.id, customerId: actor.userId, sitterId: visit?.sitterId ?? null,
        state: 'OPEN', billState: 'ON_HOLD', version: 0, objectionCount: 0,
        createdAt: asOf, updatedAt: asOf, openedAt: asOf
      });
      return commitEvent(tx, { identity, fingerprint, record, actor, asOf, event: 'ComplaintOpened', messageCode: 'MSG128' });
    });
  }

  async function eligibility({ actor, bookingId }) {
    authenticate(actor, now());
    authorizeRole(actor, 'CUSTOMER');
    return run(async tx => {
      const asOf = now();
      const booking = await loadBooking(tx, complaintId(bookingId, 'bookingId'));
      if (booking.customerId !== actor.userId) notFound();
      const visits = await tx.getVisits(booking);
      const records = await tx.bookingComplaints(booking.id);
      const whole = await bookingEligibility(tx, booking, visits, records, asOf);
      return {
        booking: bookingSummary(booking, visits), wholeBooking: { ...whole, aboveVisitTable: whole.eligible
          && visits.every(visit => !visitCompletion(visit)?.done) },
        visits: visits.map(visit => {
          const entry = visitEligibility(visit, records, asOf);
          return { ...visitSummary(visit), ...(visit.customerVisitId ? { customerVisitId: String(visit.customerVisitId) } : {}),
            eligibility: entry, canSubmit: entry.eligible
            || (entry.reason === 'COMPLAINT_ALREADY_OPEN' && whole.eligible) };
        })
      };
    });
  }

  async function get({ actor, complaintId: id, proposalOnly = false }) {
    authenticate(actor, now());
    if (proposalOnly) authorizeRole(actor, 'ADMIN');
    return run(async tx => {
      const { record, booking, visit } = await loadCase(tx, actor, complaintId(id));
      if (proposalOnly && !record.proposal) notFound();
      const details = { ...record, bookingSummary: bookingSummary(booking, visit ? [visit] : await tx.getVisits(booking)),
        visitSummary: visitSummary(visit) };
      const options = {};
      if (hasRole(actor.roles, 'STAFF')) {
        details.customerName = await tx.getCustomerName(booking.customerId);
        options.customerPhone = await tx.getPhone(booking.customerId);
        try {
          const basis = await readBasis(tx, booking.id, record.moneyDecision?.amountVnd ?? 0);
          options.billing = { status: 'AVAILABLE', basis: basis.basis, basisAmountVnd: basis.basisAmountVnd,
            approvedTotalVnd: basis.approvedTotalVnd, remainingVnd: basis.remainingVnd, paidInFull: basis.paidInFull };
        } catch (error) {
          if (error.code !== 'BILLING_SOURCE_UNAVAILABLE') throw error;
          options.billing = { status: 'UNAVAILABLE', code: error.code };
        }
      }
      return safeComplaint(details, actor, now(), options);
    });
  }

  async function list({ actor, query = {}, proposals = false }) {
    authenticate(actor, now());
    if (proposals) authorizeRole(actor, 'ADMIN');
    if (!isSingleRole(actor.roles)) fail(403, 'FORBIDDEN', 'Complaint action is forbidden');
    const sitter = hasRole(actor.roles, 'PET_SITTER');
    const options = normalizeList(query, { sitter, proposals });
    const asOf = now();
    try {
      const result = await repository.listComplaints({ actor, asOf, ...options });
      return { ...result, items: result.items.map(row => safeComplaint(row, actor, asOf)) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'COMPLAINT_UNAVAILABLE', 'Complaint list is unavailable');
    }
  }

  async function mutate(command, role, operation, normalize, transition) {
    const { actor, complaintId: id, expectedVersion, idempotencyKey, ...input } = command;
    authenticate(actor, now());
    authorizeRole(actor, role);
    const caseId = complaintId(id);
    const expected = version(expectedVersion, true);
    const identity = { actorRef: actor.userId, resourceRef: caseId, operation, key: commandKey(idempotencyKey) };
    return run(async tx => {
      const asOf = now();
      const { record, booking } = await loadCase(tx, actor, caseId);
      const previous = await tx.getIdempotencyResult(identity);
      if (previous && previous.payloadHash === legacyCommandFingerprint(input, caseId, expected, operation)) return previous.result;
      const payload = normalize(input);
      const fingerprint = hash({ payload, expected });
      const prior = replay(previous, fingerprint);
      if (prior) return prior;
      if (expected === null || (record.version ?? 0) !== expected) conflict('VERSION_CONFLICT');
      const guardedBooking = await tx.guardBooking(booking);
      const { changes, event, messageCode } = await transition({ tx, record, booking: guardedBooking, actor, payload, asOf });
      const saved = await tx.updateComplaint({
        complaintId: caseId, expectedVersion: expected,
        changes: { state: complaintState(record), objectionCount: record.objectionCount ?? 0, ...changes,
          complaintSchemaVersion: COMPLAINT_SCHEMA_VERSION,
          updatedAt: asOf, billState: changes.finalAt ? null : 'ON_HOLD' }
      });
      return commitEvent(tx, { identity, fingerprint, record: saved, actor, asOf, event, messageCode });
    });
  }

  function requireOpen(record) {
    if (complaintState(record) !== 'OPEN' || record.proposal?.status === 'PENDING') conflict();
  }

  function publish(customerResult, asOf) {
    return { state: 'RESOLVED', customerResult, resultDeliveredAt: asOf,
      appealUntil: new Date(+asOf + APPEAL_WINDOW_MS), finalAt: null };
  }

  function review(command) {
    return mutate(command, 'STAFF', 'ComplaintUnderReview', normalizeReview, ({ record, payload }) => {
      requireOpen(record);
      return { changes: { handlingNotes: payload.handlingNotes, state: 'OPEN' }, event: 'ComplaintReviewed' };
    });
  }

  function resolve(command) {
    return mutate(command, 'STAFF', 'ComplaintResolved', normalizeResolution, async ({ tx, record, booking, actor, payload, asOf }) => {
      requireOpen(record);
      const { handlingNotes, customerResult, proposal } = payload;
      if (!proposal) {
        return { changes: { ...publish(customerResult, asOf), handlingNotes }, event: 'ComplaintResolved', messageCode: 'MSG131' };
      }
      await tx.assertEvidence(proposal.evidenceRefs, actor.userId);
      const basis = await readBasis(tx, booking.id);
      checkCap(basis, proposal.amountVnd);
      if (typeof billing.applyAdjustment !== 'function') unavailable();
      return { changes: { handlingNotes, proposal: { ...proposal, status: 'PENDING', customerResult,
        createdAt: asOf, createdBy: actor.userId } }, event: 'ComplaintRefundProposed', messageCode: 'MSG147' };
    });
  }

  async function applyMoney(tx, booking, record, asOf, actor, amountVnd, priorAmountVnd) {
    const basis = await readBasis(tx, booking.id, priorAmountVnd);
    checkCap(basis, amountVnd);
    if (typeof billing.applyAdjustment !== 'function') unavailable();
    const disposition = basis.paidInFull ? 'ACCOUNTING_REFUND' : 'BILL_CREDIT';
    const ref = 'complaint:' + record.id + ':v' + (record.version + 1);
    const applied = await billing.applyAdjustment({ session: tx.session, bookingId: booking.id, complaintId: record.id,
      basis, amountVnd, priorAmountVnd, disposition, ref, actorId: actor.userId, at: asOf });
    if (applied?.applied !== true) unavailable();
    return { amountVnd, disposition, ref, decidedBy: actor.userId, decidedAt: asOf };
  }

  function decideRefund(command) {
    return mutate(command, 'ADMIN', 'COMPLAINT_REFUND_DECIDE', normalizeRefundDecision,
      async ({ tx, record, booking, actor, payload, asOf }) => {
        const { proposal } = record;
        if (complaintState(record) !== 'OPEN' || proposal?.status !== 'PENDING') conflict();
        const { outcome, reason } = payload;
        if (outcome === 'REDUCE' && payload.amountVnd >= proposal.amountVnd) invalid('amountVnd', 'Enter an amount lower than proposed');
        const amountVnd = outcome === 'APPROVE' ? proposal.amountVnd : payload.amountVnd;
        const payment = outcome === 'REJECT' ? { amountVnd: null, decidedAt: asOf, decidedBy: actor.userId }
          : await applyMoney(tx, booking, record, asOf, actor, amountVnd, 0);
        const status = { APPROVE: 'APPROVED', REDUCE: 'REDUCED', REJECT: 'REJECTED' }[outcome];
        return { changes: { ...publish(proposal.customerResult, asOf), proposal: { ...proposal, status },
          moneyDecision: { ...payment, outcome, reason } }, event: 'ComplaintRefundDecided' };
      });
  }

  function object(command) {
    return mutate(command, 'CUSTOMER', 'ComplaintObjected', normalizeObjection, ({ record, payload, asOf }) => {
      if (record.objectionCount) conflict('OBJECTION_ALREADY_USED');
      if (complaintState(record) !== 'RESOLVED') conflict();
      const cutoff = instant(record.appealUntil);
      if (!cutoff || cutoff <= asOf || complaintFinalAt(record, asOf)) conflict('OBJECTION_WINDOW_EXPIRED');
      return { changes: { state: 'ESCALATED', objectionCount: 1, objection: { reason: payload.reason, at: asOf },
        appealUntil: null, finalAt: null }, event: 'ComplaintObjected', messageCode: 'MSG129' };
    });
  }

  function decide(command) {
    return mutate(command, 'ADMIN', 'ComplaintClosed', normalizeDecision, async ({ tx, record, booking, actor, payload, asOf }) => {
      if (complaintState(record) !== 'ESCALATED') conflict();
      const priorAmountVnd = record.moneyDecision?.amountVnd ?? 0;
      const changed = payload.amountVnd !== null && payload.amountVnd !== priorAmountVnd;
      const moneyDecision = changed
        ? { ...await applyMoney(tx, booking, record, asOf, actor, payload.amountVnd, priorAmountVnd), outcome: 'FINAL_ADJUSTMENT' }
        : record.moneyDecision ?? null;
      await tx.changeHold(booking, record.id, actor.userId, true);
      return { changes: { state: 'RESOLVED', customerResult: payload.customerResult,
        moneyDecision, finalAt: asOf, resultDeliveredAt: asOf, appealUntil: null,
        finalDecision: { actorId: actor.userId, decidedAt: asOf,
          ...(changed && record.moneyDecision ? { previousMoneyDecision: record.moneyDecision } : {}) }
      }, event: 'ComplaintDecided' };
    });
  }

  async function evidence({ actor, complaintId: id, mediaId }) {
    authenticate(actor, now());
    if (!hasRole(actor.roles, 'STAFF') && !hasRole(actor.roles, 'CUSTOMER')) {
      fail(403, 'FORBIDDEN', 'Complaint evidence is forbidden');
    }
    if (!MEDIA_ID.test(mediaId ?? '')) notFound();
    const ownerId = await run(async tx => {
      const { record, booking } = await loadCase(tx, actor, complaintId(id));
      if (record.evidenceRefs?.some(ref => ref.mediaId === mediaId)) return booking.customerId;
      if (hasRole(actor.roles, 'STAFF') && record.proposal?.evidenceRefs?.some(ref => ref.mediaId === mediaId)) {
        return record.proposal.createdBy;
      }
      notFound();
    });
    if (!readImage) fail(503, 'PROVIDER_UNAVAILABLE', 'Private media is unavailable');
    return readImage({ actor: { userId: ownerId }, id: mediaId });
  }

  async function readBookingComplaintHold({ bookingId, asOf = now(), session }) {
    const checkedAt = instant(asOf);
    if (!checkedAt) throw new TypeError('asOf must be a valid instant');
    return run(async tx => {
      const id = complaintId(bookingId, 'bookingId');
      await loadBooking(tx, id);
      const records = await tx.bookingComplaints(id);
      const finalTimes = records.map(record => complaintFinalAt(record, checkedAt));
      const hasUnfinalizedComplaints = finalTimes.some(at => !at);
      const completed = finalTimes.filter(Boolean);
      return {
        bookingId: id, hasUnfinalizedComplaints, billState: hasUnfinalizedComplaints ? 'ON_HOLD' : null,
        latestFinalAt: completed.length ? new Date(Math.max(...completed.map(Number))).toISOString() : null,
        approvedAmounts: records.filter(record => record.moneyDecision?.ref).map(record => ({
          complaintId: record.id, amountVnd: record.moneyDecision.amountVnd, ref: record.moneyDecision.ref
        }))
      };
    }, session);
  }

  return { submit, eligibility, get, list, review, resolve, decideRefund, object, decide, evidence, readBookingComplaintHold };
}

export const createComplaintManagementService = createComplaintService;
