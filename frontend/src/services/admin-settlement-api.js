import { ApiError } from './api-client.js';

export function createAdminSettlementApi(request, { privateImages } = {}) {
  const command = async (id, path, body, key) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new ApiError('INVALID_REQUEST_ID');
    return (await request(`/admin/settlements/${id}/${path}`, { method: 'POST', body, idempotencyKey: key })).data;
  };
  return Object.freeze({
    uploadEvidence: privateImages ? async (file, key) => {
      const image = await privateImages.upload(file, { idempotencyKey: key });
      return `private-image:${image.id}`;
    } : undefined,
    load: async ({ signal, cursor } = {}) => (await request(`/admin/settlements${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal })).data,
    decide: (id, body, key) => command(id, 'decisions', body, key),
    recordTransfer: (id, body, key) => command(id, 'transfer-records', body, key)
  });
}

export const pendingAdminSettlementApi = Object.freeze({
  load: async () => { throw new ApiError('INTEGRATION_PENDING'); }
});
