import { AppError } from '../utils/app-error.js';

const invalid = () => { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid sitter management filters'); };
export function sitterManagementQuery(query = {}, kind = 'list') {
  const allowed = kind === 'detail' ? ['days'] : kind === 'activity' ? ['days', 'cursor', 'limit']
    : ['search', 'status', 'area', 'employmentType', 'source', 'profileState', 'days', ...(kind === 'list' ? ['cursor', 'limit'] : [])];
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !allowed.includes(key))) invalid();
  const result = { days: 30, limit: 20, search: '', status: '', area: '', employmentType: '', source: 'ALL', profileState: '' };
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string' || value.length > (key === 'cursor' ? 2048 : 100) || /[\u0000-\u001f]/.test(value)) invalid();
    if (value) result[key] = value.trim();
  }
  if (![7, 30, 90].includes(Number(result.days)) || !/^[1-9]\d?$/.test(String(result.limit)) || Number(result.limit) > 50) invalid();
  for (const [key, values] of Object.entries({ status: ['', 'ACTIVE', 'SUSPENDED', 'MISSING'],
    source: ['ALL', 'REAL', 'DEMO'], employmentType: ['', 'FULL_TIME', 'PART_TIME', 'MISSING', 'AMBIGUOUS'],
    profileState: ['', 'APPROVED', 'SUBMITTED', 'REJECTED', 'MISSING'] })) if (!values.includes(result[key])) invalid();
  if (result.area && !/^[A-Z][A-Z0-9_]{0,79}$/.test(result.area)) invalid();
  return { ...result, days: Number(result.days), limit: Number(result.limit) };
}
