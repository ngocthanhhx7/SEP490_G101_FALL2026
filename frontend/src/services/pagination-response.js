import { ApiError } from './api-client.js';

export function readPagination(data) {
  const values = [data?.page, data?.limit, data?.total];
  if (values.every(value => value === undefined)) return undefined;
  if (!values.every(value => Number.isSafeInteger(value)) || data.page < 1 || data.limit < 1 || data.total < 0) {
    throw new ApiError('INVALID_RESPONSE', 200);
  }
  return { page: data.page, limit: data.limit, total: data.total };
}
