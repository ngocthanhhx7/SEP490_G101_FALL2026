import { ApiError, createApiClient } from './api-client.js';

const ORDER_COUNTS = ['PREPARE', 'AWAITING_PICKUP', 'RETURNING'];

export async function readSaleStaffDashboard({ signal } = {}) {
  const request = createApiClient();
  const result = await request('/dashboards/sale-staff', { signal });
  const counts = result.data?.counts;
  if (!counts || !ORDER_COUNTS.every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) {
    throw new ApiError('INVALID_RESPONSE', 503);
  }
  return result;
}
