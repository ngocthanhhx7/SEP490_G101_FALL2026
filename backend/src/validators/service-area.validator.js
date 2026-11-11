import { AppError } from '../utils/app-error.js';
const invalid = () => { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid area request'); };
export const validAreaCode = value => typeof value === 'string' && /^(?:PROVINCE_\d{2}|COMMUNE_\d{5}|(?:CITY|DISTRICT)_[A-Z0-9_-]{1,56})$/.test(value);
export function areaListInput(query = {}) {
  if (Object.keys(query).some(key => !['parentCode', 'level', 'after'].includes(key))) invalid();
  if (query.level !== undefined && !['PROVINCE', 'COMMUNE', 'CITY', 'DISTRICT'].includes(query.level)) invalid();
  for (const key of ['parentCode', 'after']) if (query[key] !== undefined && !validAreaCode(query[key])) invalid();
  if (!['PROVINCE', 'CITY'].includes(query.level) && !query.parentCode) invalid();
  return { ...query };
}
export function areaChangeInput(body, key) {
  if (!body || Object.keys(body).some(k => !['codes', 'enabled', 'expectedVersion', 'reason'].includes(k))) invalid();
  if (!Array.isArray(body.codes) || !body.codes.length || body.codes.length > 100 || new Set(body.codes).size !== body.codes.length || body.codes.some(c => !validAreaCode(c))) invalid();
  if (typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 || typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 500) invalid();
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) invalid();
  return { ...body, codes: [...body.codes].sort(), reason: body.reason.trim() };
}
