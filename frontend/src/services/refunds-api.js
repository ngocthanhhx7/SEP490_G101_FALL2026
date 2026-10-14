const REFUND_ID = /^[0-9a-f]{24}$/i;

function requireRefundId(value) {
  if (typeof value !== 'string' || !REFUND_ID.test(value)) throw new TypeError('Invalid refund ID');
  return value;
}

function requireIdempotencyKey(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new TypeError('An idempotency key is required');
  }
  return value;
}

export function createRefundApi({ request } = {}) {
  if (typeof request !== 'function') throw new TypeError('An API request function is required');

  return Object.freeze({
    propose(input, { idempotencyKey } = {}) {
      return request('/refund-proposals', {
        method: 'POST', body: input, idempotencyKey: requireIdempotencyKey(idempotencyKey)
      });
    },

    decide(refundId, command, { idempotencyKey } = {}) {
      const id = requireRefundId(refundId);
      if (!command || !Number.isSafeInteger(command.expectedVersion)) throw new TypeError('Expected refund version is required');
      const { expectedVersion, ...body } = command;
      return request(`/refunds/${id}/decisions`, {
        method: 'POST', body, expectedVersion, idempotencyKey: requireIdempotencyKey(idempotencyKey)
      });
    },

    recordTransfer(refundId, command, { idempotencyKey } = {}) {
      const id = requireRefundId(refundId);
      if (!command || !Number.isSafeInteger(command.expectedVersion)) throw new TypeError('Expected refund version is required');
      const { expectedVersion, ...body } = command;
      return request(`/refunds/${id}/transfer-records`, {
        method: 'POST', body, expectedVersion, idempotencyKey: requireIdempotencyKey(idempotencyKey)
      });
    }
  });
}
