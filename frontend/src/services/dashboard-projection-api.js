import { ApiError, createApiClient } from './api-client.js';

const validDate = value => typeof value === 'string' && /Z$|[+-]\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const amount = value => Number.isSafeInteger(value) && value >= 0;
const identifier = value => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
function validRow(row, kind) {
  if (!row || !identifier(row.id)) return false;
  if (['startsAt', 'completedAt', 'transferRecordedAt'].some(key => row[key] !== undefined && row[key] !== null && !validDate(row[key]))) return false;
  if (['sitter-profile', 'sitter-list'].includes(kind)) return typeof row.displayName === 'string'
    && typeof row.bio === 'string' && Array.isArray(row.areas) && row.areas.every(area => typeof area === 'string')
    && amount(row.reviewCount) && (row.reviewCount === 0 ? row.rating === null : Number.isFinite(row.rating) && row.rating >= 1 && row.rating <= 5);
  if (kind === 'earnings') return identifier(row.visitId) && validDate(row.completedAt)
    && ['accrued', 'pending', 'available', 'held', 'reserved', 'paid'].every(key => amount(row[key]))
    && typeof row.explanation === 'string' && typeof row.ledgerReference === 'string';
  if (kind === 'payroll') return amount(row.amountVnd) && typeof row.requestWeekKey === 'string' && typeof row.state === 'string';
  return typeof row.state === 'string' && validDate(row.startsAt);
}

export function createProjectionApi({ path, kind, request, target = false }) {
  let client;
  const send = (...args) => {
    if (request) return request(...args);
    client ??= createApiClient();
    return client(...args);
  };
  return Object.freeze({ async read({ signal, targetId, ...query } = {}) {
    if (Object.keys(query).some(key => !['from', 'to', 'search', 'cursor', 'limit'].includes(key))
      || Object.values(query).some(value => typeof value !== 'string' && typeof value !== 'number')) throw new ApiError('INVALID_FILTER', 422);
    if (target && !identifier(targetId)) throw new ApiError('INVALID_RESOURCE_ID', 422);
    const params = new globalThis.URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== '') params.set(key, String(value));
    const result = await send(`${target ? path.replace(':sitterId', targetId) : path}?${params}`, { signal });
    if (result.pending) return result;
    const data = result.data;
    if (!data || data.kind !== kind || !validDate(data.asOf)
      || data.timeZone !== 'Asia/Ho_Chi_Minh' || !Array.isArray(data.metrics) || !Array.isArray(data.items)
      || !data.metrics.every(row => typeof row.key === 'string' && typeof row.label === 'string' && Number.isSafeInteger(row.value) && row.value >= 0)
      || !(data.nextCursor === null || (typeof data.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(data.nextCursor)))
      || !data.items.every(row => validRow(row, kind)) || new Set(data.items.map(row => row.id)).size !== data.items.length) throw new ApiError('INVALID_RESPONSE', 503);
    return result;
  } });
}
