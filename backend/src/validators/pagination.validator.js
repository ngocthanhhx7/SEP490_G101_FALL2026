import { AppError } from '../utils/app-error.js';
import { PAGE_LIMITS } from '../constants/pagination.js';

// The query keys a paged list accepts besides its own filters.
export const PAGE_QUERY_KEYS = Object.freeze(['page', 'limit']);

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);

// `page` starts at 1. A list validator checks its own keys and calls this for page and limit.
export function parsePageQuery(query = {}, { defaultLimit = PAGE_LIMITS.defaultLimit, maxLimit = PAGE_LIMITS.maxLimit } = {}) {
  const out = { page: 1, limit: defaultLimit };
  if (query.page !== undefined) {
    const page = Number(query.page);
    if (typeof query.page !== 'string' || !/^\d{1,6}$/u.test(query.page) || page < 1 || page > PAGE_LIMITS.maxPage) throw invalid('page is invalid');
    out.page = page;
  }
  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (typeof query.limit !== 'string' || !/^\d{1,3}$/u.test(query.limit) || limit < 1 || limit > maxLimit) throw invalid('limit is invalid');
    out.limit = limit;
  }
  return out;
}
