import { AppError } from '../utils/app-error.js';

export function parsePriceHistoryQuery(query = {}, serviceId) {
  const invalid = () => { throw new AppError(422, 'VALIDATION_FAILED', 'Price history query is invalid'); };
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['limit', 'before'].includes(key))) invalid();
  let limit = 20;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^[1-9]\d?$/.test(query.limit) || Number(query.limit) > 50) invalid();
    limit = Number(query.limit);
  }
  let before;
  if (query.before !== undefined) {
    if (typeof query.before !== 'string' || query.before.length !== 49) invalid();
    const [owner, timestamp] = query.before.split('~');
    if (owner !== serviceId || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp ?? '')) invalid();
    before = new Date(timestamp);
    if (!Number.isFinite(before.getTime()) || before.toISOString() !== timestamp) invalid();
  }
  return { limit, before };
}
