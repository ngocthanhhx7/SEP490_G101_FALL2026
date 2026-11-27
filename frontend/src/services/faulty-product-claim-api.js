import { ApiError, createApiClient } from './api-client.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const PHOTO_ID = /^[a-f0-9]{64}$/;

function requireId(value, name) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ApiError(`INVALID_${name.toUpperCase()}`, 400);
  }
  return encodeURIComponent(value);
}

function requirePhotoId(value) {
  if (typeof value !== 'string' || !PHOTO_ID.test(value)) {
    throw new ApiError('INVALID_PHOTO_ID', 400);
  }
  return encodeURIComponent(value);
}

async function fetchBlob(url, { fetchImpl = globalThis.fetch, signal } = {}) {
  const response = await fetchImpl(url, { credentials: 'same-origin', signal });
  if (!response.ok) {
    throw new ApiError('IMAGE_UNAVAILABLE', response.status);
  }
  return response.blob();
}

export function createFaultyProductClaimApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs } = {}) {
  let client;
  const send = (...args) => {
    if (request) return request(...args);
    if (!client) client = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return client(...args);
  };

  return Object.freeze({
    async getEligibility(orderId, { signal } = {}) {
      const response = await send(`/product-orders/${requireId(orderId, 'order_id')}/faulty-claim-eligibility`, { signal });
      return response.data;
    },

    async submitClaim(orderId, body, idempotencyKey) {
      const response = await send(`/product-orders/${requireId(orderId, 'order_id')}/faulty-claims`, {
        method: 'POST',
        body,
        idempotencyKey
      });
      return response.data;
    },

    async listClaims({ tab = 'WAITING_CHECK', page = 1, limit = 20 } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams({ tab, page: String(page), limit: String(limit) });
      const response = await send(`/admin/faulty-product-claims?${params.toString()}`, { signal });
      return response.data;
    },

    async getClaim(claimId, { signal } = {}) {
      const response = await send(`/admin/faulty-product-claims/${requireId(claimId, 'claim_id')}`, { signal });
      return response.data;
    },

    async inspectClaim(claimId, body) {
      const response = await send(`/admin/faulty-product-claims/${requireId(claimId, 'claim_id')}/inspect`, {
        method: 'POST',
        body
      });
      return response.data;
    },

    async decideClaim(claimId, body) {
      const response = await send(`/admin/faulty-product-claims/${requireId(claimId, 'claim_id')}/decide`, {
        method: 'POST',
        body
      });
      return response.data;
    },

    async markExchangeSent(claimId, body = {}) {
      const response = await send(`/admin/faulty-product-claims/${requireId(claimId, 'claim_id')}/exchange-sent`, {
        method: 'POST',
        body
      });
      return response.data;
    },

    readAdminPhoto(claimId, photoId, { signal } = {}) {
      return fetchBlob(
        `/api/v1/admin/faulty-product-claims/${requireId(claimId, 'claim_id')}/photos/${requirePhotoId(photoId)}`,
        { fetchImpl, signal }
      );
    }
  });
}
