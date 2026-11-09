import { ApiError } from './api-client.js';

export async function listCustomerBookings(request, { signal, cursor } = {}) {
  const result = await request('/bookings?limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal });
  const items = Array.isArray(result.data) ? result.data : result.data?.items;
  if (!Array.isArray(items) || items.some(item => typeof item?.id !== 'string' || typeof item.state !== 'string'
    || (item.serviceName !== undefined && typeof item.serviceName !== 'string')
    || (item.petNames !== undefined && (!Array.isArray(item.petNames) || item.petNames.some(name => typeof name !== 'string')))
    || (item.totalVnd !== null && item.totalVnd !== undefined && (!Number.isSafeInteger(item.totalVnd) || item.totalVnd < 0)))) throw new ApiError('INVALID_RESPONSE');
  return { ...result, data: items, meta: { ...result.meta, nextCursor: result.data?.nextCursor ?? result.meta?.nextCursor ?? null } };
}
