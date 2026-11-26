// Keep recovery beyond the maximum 30-second payOS request timeout.
const RECOVERY_DELAY_MS = 60_000;

const activeAttempts = new Set();
const attemptKey = intent => String(intent._id) + ':' + String(+intent.linkRequestedAt);

export async function runPaymentLinkAttempt(intent, run) {
  const key = attemptKey(intent);
  activeAttempts.add(key);
  try {
    return await run();
  } finally {
    activeAttempts.delete(key);
  }
}

export function canRecoverUnpublishedAttempt(intent, at) {
  return intent.linkState === 'CREATING' && intent.linkRequestedAt instanceof Date
    && +at - +intent.linkRequestedAt >= RECOVERY_DELAY_MS && !activeAttempts.has(attemptKey(intent))
    && intent.checkoutUrl === undefined && intent.paymentLinkId === undefined;
}

export function isMissingPayosLink(error) {
  return error?.code === 'PAYOS_REQUEST_FAILED' && error.details?.providerHttpStatus === 404;
}
