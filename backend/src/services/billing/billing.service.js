import { AppError } from '../../utils/app-error.js';

const PAYMENT_MODES = Object.freeze({ PREPAY: 'PREPAY', POSTPAY: 'POSTPAY' });

function fail(status, code, message, details) {
  throw new AppError(status, code, message, details);
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(422, 'VALIDATION_FAILED', `A valid ${field} is required`);
  }
  return value.trim();
}

function requireVersion(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(422, 'VALIDATION_FAILED', `A valid ${field} is required`);
  }
}

function paymentModeForOriginalVisitCount(originalVisitCount) {
  if (!Number.isSafeInteger(originalVisitCount) || originalVisitCount < 1) {
    fail(409, 'DECISION_REQUIRED', 'The booking visit-count snapshot is unavailable');
  }
  return originalVisitCount > 1 ? PAYMENT_MODES.PREPAY : PAYMENT_MODES.POSTPAY;
}

function requirePositiveVnd(amountVnd) {
  if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
    fail(409, 'DECISION_REQUIRED', 'A positive VND amount must come from the server snapshot');
  }
}

function requireVnd(currency) {
  if (currency !== 'VND') fail(409, 'DECISION_REQUIRED', 'Only a VND payment snapshot is supported');
}

function requireTimestamp(value, field) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    fail(409, 'DECISION_REQUIRED', `A server-resolved ${field} is required`);
  }
  return parsed;
}

function validateCommonCommand(command) {
  const actorId = requireText(command?.actorId, 'actor');
  const bookingId = requireText(command?.bookingId, 'booking ID');
  const idempotencyKey = requireText(command?.idempotencyKey, 'idempotency key');
  requireVersion(command?.expectedVersion, 'expected version');
  return { actorId, bookingId, idempotencyKey, expectedVersion: command.expectedVersion };
}

function requireOwnedContext(context, expectedVersion) {
  if (!context) fail(404, 'RESOURCE_NOT_FOUND', 'Booking was not found');
  if (context.bookingState !== 'AWAITING_PAYMENT') {
    fail(409, 'INVALID_STATE', 'Booking is not awaiting payment');
  }
  if (context.version !== expectedVersion) {
    fail(409, 'VERSION_CONFLICT', 'Booking changed; reload before continuing');
  }
}

/**
 * Billing boundary for P31. Repositories own atomic/idempotent persistence and
 * resource authorization; P01/P34 provide the eventual schema and HTTP wiring.
 * Bill records describe amounts due. They are not payment receipts or earnings.
 */
export function createBillingService({ bookings, paymentIntents, postpayEligibility, bills, clock = () => new Date() }) {
  for (const [name, port, methods] of [
    ['bookings', bookings, ['findOwnedPaymentContext', 'findOwnedVisitBillingContext']],
    ['paymentIntents', paymentIntents, ['replayExistingIntent', 'createOrReplayPending']],
    ['postpayEligibility', postpayEligibility, ['resolve']],
    ['bills', bills, ['replayExistingBill', 'issueIfAbsent']],
  ]) {
    if (!port || methods.some(method => typeof port[method] !== 'function')) {
      throw new TypeError(`Billing service requires the ${name} port`);
    }
  }
  if (typeof clock !== 'function') throw new TypeError('Billing service clock must be a function');

  return Object.freeze({
    async createPrepaymentIntent(command) {
      const args = validateCommonCommand(command);
      requireVersion(command.quoteVersion, 'quote version');
      const context = await bookings.findOwnedPaymentContext({
        actorId: args.actorId,
        bookingId: args.bookingId,
      });
      if (!context) fail(404, 'RESOURCE_NOT_FOUND', 'Booking was not found');

      // Return the stored result for a retry before current state/version/deadline checks.
      // The repository must scope this lookup to owner, booking, operation and key, and reject
      // a reused key with a different request fingerprint. createOrReplayPending remains atomic
      // to close the race between this lookup and a concurrent first attempt.
      const existingIntent = await paymentIntents.replayExistingIntent({
        actorId: args.actorId,
        bookingId: args.bookingId,
        idempotencyKey: args.idempotencyKey,
        expectedVersion: args.expectedVersion,
        quoteVersion: command.quoteVersion,
      });
      if (existingIntent) {
        return Object.freeze({ intent: existingIntent, paymentMode: PAYMENT_MODES.PREPAY, dispatchAllowed: false });
      }

      requireOwnedContext(context, args.expectedVersion);

      const terms = context.paymentTerms;
      const requiredMode = paymentModeForOriginalVisitCount(terms?.originalVisitCount);
      if (terms.paymentMode !== requiredMode) {
        fail(409, 'DECISION_REQUIRED', 'Booking payment mode does not match its original visit snapshot', {
          decisionIds: ['FIN-01-TIME'],
        });
      }
      if (requiredMode !== PAYMENT_MODES.PREPAY) {
        fail(409, 'INVALID_STATE', 'Single-visit bookings do not use prepayment intents');
      }
      if (terms.quoteVersion !== command.quoteVersion) {
        fail(409, 'VERSION_CONFLICT', 'Quote changed; reload the booking before payment');
      }
      if (terms.paymentState !== 'UNPAID') {
        fail(409, 'INVALID_STATE', 'Booking payment is not eligible for a new intent');
      }
      if (!terms.quoteSnapshotVersion || !terms.paymentDeadlineAt) {
        fail(409, 'DECISION_REQUIRED', 'A finalized quote and payment deadline are required', {
          decisionIds: ['FIN-01-TIME', 'FIN-02-ALLOC'],
        });
      }
      requirePositiveVnd(terms.amountVnd);
      requireVnd(terms.currency);
      const expiresAt = requireTimestamp(terms.paymentDeadlineAt, 'payment deadline');
      if (expiresAt <= requireTimestamp(clock(), 'server time')) {
        fail(409, 'DEADLINE_PASSED', 'The payment deadline has passed');
      }

      const intent = await paymentIntents.createOrReplayPending({
        actorId: args.actorId,
        bookingId: args.bookingId,
        idempotencyKey: args.idempotencyKey,
        expectedVersion: args.expectedVersion,
        quoteVersion: command.quoteVersion,
        quoteSnapshotVersion: terms.quoteSnapshotVersion,
        originalVisitCount: terms.originalVisitCount,
        amountVnd: terms.amountVnd,
        currency: terms.currency,
        expiresAt,
      });
      return Object.freeze({ intent, paymentMode: requiredMode, dispatchAllowed: false });
    },

    async issuePostpayBill(command) {
      const args = validateCommonCommand(command);
      const visitId = requireText(command?.visitId, 'visit ID');
      const context = await bookings.findOwnedVisitBillingContext({
        actorId: args.actorId,
        bookingId: args.bookingId,
        visitId,
      });
      if (!context) fail(404, 'RESOURCE_NOT_FOUND', 'Booking was not found');

      // A timeout can happen after the bill transaction commits. Replay the
      // stored result before checking mutable completion, version, eligibility,
      // or due-date state. The repository must scope this lookup to owner,
      // booking, visit, operation, and key, and reject a reused key with a
      // different request fingerprint.
      const existingBill = await bills.replayExistingBill({
        actorId: args.actorId,
        bookingId: args.bookingId,
        visitId,
        idempotencyKey: args.idempotencyKey,
        expectedVersion: args.expectedVersion,
      });
      if (existingBill) {
        return Object.freeze({ bill: existingBill, paymentMode: PAYMENT_MODES.POSTPAY });
      }

      if (context.version !== args.expectedVersion) {
        fail(409, 'VERSION_CONFLICT', 'Booking changed; reload before issuing a bill');
      }

      const terms = context.paymentTerms;
      const requiredMode = paymentModeForOriginalVisitCount(terms?.originalVisitCount);
      if (terms.paymentMode !== requiredMode || requiredMode !== PAYMENT_MODES.POSTPAY) {
        fail(409, 'INVALID_STATE', 'Only an original single-visit postpay booking can receive this bill');
      }
      if (context.bookingState !== 'COMPLETED' || context.visitState !== 'COMPLETED') {
        fail(409, 'INVALID_STATE', 'Postpay billing is available only after the visit is completed');
      }

      const eligibility = await postpayEligibility.resolve({
        bookingId: args.bookingId,
        visitId,
        actorId: args.actorId,
        bookingVersion: args.expectedVersion,
      });
      if (!eligibility || eligibility.state !== 'READY' || !Array.isArray(eligibility.holdRefs)
        || eligibility.holdRefs.length > 0 || !eligibility.snapshotVersion) {
        fail(409, 'DECISION_REQUIRED', 'Billing eligibility or hold resolution is still pending', {
          decisionIds: ['FIN-07-ELIG'],
        });
      }
      requirePositiveVnd(eligibility.amountVnd);
      requireVnd(eligibility.currency);
      const dueAt = requireTimestamp(eligibility.dueAt, 'bill due date');
      const completedAt = requireTimestamp(context.completedAt, 'visit completion time');
      if (dueAt <= completedAt) {
        fail(409, 'DECISION_REQUIRED', 'Bill due date must follow visit completion');
      }

      const bill = await bills.issueIfAbsent({
        actorId: args.actorId,
        bookingId: args.bookingId,
        visitId,
        idempotencyKey: args.idempotencyKey,
        bookingVersion: args.expectedVersion,
        quoteVersion: terms.quoteVersion,
        quoteSnapshotVersion: eligibility.snapshotVersion,
        amountVnd: eligibility.amountVnd,
        currency: eligibility.currency,
        dueAt,
        holdRefs: [],
      });
      return Object.freeze({ bill, paymentMode: requiredMode });
    },
  });
}

export { paymentModeForOriginalVisitCount };
