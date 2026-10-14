import { createHash } from 'node:crypto';

const PROVIDER = 'PAYOS';
const SUCCESS_CODE = '00';
const EXPECTED_CURRENCY = 'VND';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function canonicalOrderCode(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0 ? String(numericValue) : null;
}

function safeIdentityValue(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  return value === undefined ? null : `[invalid:${typeof value}]`;
}

function createEventId(data) {
  // Only include stable payment identifiers. Do not persist the raw webhook or bank fields.
  const identity = Object.fromEntries([
    'orderCode', 'reference', 'amount', 'currency', 'code', 'paymentLinkId', 'transactionDateTime'
  ].map(key => [key, safeIdentityValue(data[key])]));
  return createHash('sha256').update(JSON.stringify([PROVIDER, identity])).digest('hex');
}

function makeReceipt({ data, eventId, orderCode, receivedAt }) {
  const transactionReference = typeof data.reference === 'string' && data.reference.trim()
    ? data.reference.trim() : null;
  // payOS documents a timezone-less transactionDateTime sample; preserve its value
  // verbatim until the provider's timezone semantics are confirmed.
  const providerTransactionDateTime = typeof data.transactionDateTime === 'string'
    && data.transactionDateTime.trim() ? data.transactionDateTime.trim() : null;

  return {
    eventId,
    provider: PROVIDER,
    providerOrderCode: orderCode,
    providerTransactionReference: transactionReference,
    amountVnd: Number.isSafeInteger(data.amount) ? data.amount : null,
    currency: typeof data.currency === 'string' ? data.currency : null,
    providerCode: typeof data.code === 'string' ? data.code : null,
    providerTransactionDateTime,
    receivedAt: receivedAt.toISOString()
  };
}

function reconcile(reason, intent) {
  return {
    type: 'RECONCILE',
    reason,
    intentId: intent?.id === undefined || intent?.id === null ? null : String(intent.id),
    expectedIntentVersion: Number.isSafeInteger(intent?.version) ? intent.version : null
  };
}

function classifyReceipt({ data, orderCode, receipt, intent, receivedAt }) {
  if (!orderCode) return reconcile('INVALID_ORDER_CODE');
  if (!intent) return reconcile('UNKNOWN_REFERENCE');
  if (canonicalOrderCode(intent.providerReference) !== orderCode) return reconcile('REFERENCE_MISMATCH', intent);
  if (!Number.isSafeInteger(data.amount) || data.amount <= 0) return reconcile('INVALID_AMOUNT', intent);
  if (data.currency !== EXPECTED_CURRENCY) return reconcile('CURRENCY_MISMATCH', intent);
  if (data.code !== SUCCESS_CODE) return reconcile('PROVIDER_PAYMENT_NOT_SUCCESSFUL', intent);
  if (!receipt.providerTransactionReference) return reconcile('TRANSACTION_REFERENCE_MISSING', intent);
  if (intent.state !== 'PENDING') {
    return reconcile(intent.state === 'EXPIRED' ? 'INTENT_EXPIRED' : 'INTENT_NOT_PENDING', intent);
  }
  if (intent.bookingState !== 'AWAITING_PAYMENT') {
    return reconcile(intent.bookingState === 'CANCELLED' || intent.bookingState === 'CLOSED'
      ? 'BOOKING_NOT_PAYABLE' : 'BOOKING_NOT_AWAITING_PAYMENT', intent);
  }
  if (!Number.isSafeInteger(intent.amountVnd) || intent.amountVnd <= 0) {
    return reconcile('INTENT_AMOUNT_UNAVAILABLE', intent);
  }
  if (data.amount !== intent.amountVnd) return reconcile('AMOUNT_MISMATCH', intent);
  if (intent.currency !== EXPECTED_CURRENCY) return reconcile('INTENT_CURRENCY_UNAVAILABLE', intent);

  const expiresAt = asDate(intent.expiresAt);
  if (!expiresAt) return reconcile('INTENT_EXPIRY_UNAVAILABLE', intent);
  if (receivedAt.getTime() >= expiresAt.getTime()) return reconcile('INTENT_EXPIRED', intent);
  if (intent.id === undefined || intent.id === null || String(intent.id).length === 0) {
    return reconcile('INTENT_ID_UNAVAILABLE', intent);
  }
  if (!Number.isSafeInteger(intent.version) || intent.version < 0) {
    return reconcile('INTENT_VERSION_UNAVAILABLE', intent);
  }

  return {
    type: 'MARK_PAID',
    intentId: String(intent.id),
    expectedIntentVersion: intent.version,
    expectedIntentState: 'PENDING',
    expectedBookingState: 'AWAITING_PAYMENT',
    expectedExpiresAt: expiresAt.toISOString()
  };
}

function formatRepositoryResult(result, decision) {
  if (!isRecord(result)) throw new TypeError('Webhook repository returned an invalid result');
  if (result.status === 'DUPLICATE') return { status: 'DUPLICATE' };
  if (result.status === 'RECONCILIATION_REQUIRED') {
    return {
      status: 'RECONCILIATION_REQUIRED',
      reason: typeof result.reason === 'string' ? result.reason : decision.reason ?? 'INTENT_CHANGED_DURING_WEBHOOK'
    };
  }
  if (result.status === 'APPLIED' && decision.type === 'MARK_PAID') return { status: 'PAYMENT_VERIFIED' };
  throw new TypeError('Webhook repository returned an unsupported outcome');
}

/**
 * Creates an isolated payOS webhook processor.
 *
 * provider.verifyWebhook(body) must use the server-side payOS verifier and return its signed `data`.
 * repository.recordWebhookOutcome(...) must atomically dedupe eventId and persist either the receipt
 * plus conditional payment transition, or a reconciliation record. It must atomically persist the
 * corresponding PaymentVerified or PaymentReconciliationRequired outbox event as well. For MARK_PAID
 * it must recheck the expected version/state, booking state, and expiry in that same transaction.
 * Lookup results use the normalized fields documented by this port; no database schema is assumed.
 */
export function createPayosPaymentWebhookService({ provider, repository, clock = () => new Date() } = {}) {
  if (typeof provider?.verifyWebhook !== 'function'
    || typeof repository?.findPaymentIntentByProviderReference !== 'function'
    || typeof repository?.recordWebhookOutcome !== 'function'
    || typeof clock !== 'function') {
    throw new TypeError('A verified payOS provider, payment repository, and clock are required');
  }

  return Object.freeze({
    async handleWebhook(body) {
      // Invalid signatures propagate from the provider verifier before the repository is touched.
      const data = await provider.verifyWebhook(body);
      if (!isRecord(data)) throw new TypeError('payOS verifier must return signed webhook data');

      const receivedAt = asDate(clock());
      if (!receivedAt) throw new TypeError('Webhook clock must return a valid date');

      const orderCode = canonicalOrderCode(data.orderCode);
      const eventId = createEventId(data);
      const receipt = makeReceipt({ data, eventId, orderCode, receivedAt });
      const intent = orderCode
        ? await repository.findPaymentIntentByProviderReference(orderCode)
        : null;
      const decision = classifyReceipt({ data, orderCode, receipt, intent, receivedAt });
      const result = await repository.recordWebhookOutcome({ eventId, receipt, decision });

      return formatRepositoryResult(result, decision);
    }
  });
}
