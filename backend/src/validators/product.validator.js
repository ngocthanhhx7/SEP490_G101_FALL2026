import { AppError } from '../utils/app-error.js';
import { PRODUCT_CATEGORIES, PRODUCT_PET_TYPES, PRODUCT_LIMITS } from '../constants/product-fields.js';
import { parsePageQuery } from './pagination.validator.js';

const OBJECT_ID = /^[a-f\d]{24}$/i;

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);

export function parseObjectId(value, field = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) throw invalid(`${field} is invalid`);
  return value;
}

export function parseQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > PRODUCT_LIMITS.maxLineQuantity) {
    throw invalid('quantity is invalid');
  }
  return value;
}

export function requireOnlyKeys(input, allowed, required = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(input, key))) {
    throw invalid('Request body is invalid');
  }
}

// Query strings arrive as strings; anything else (arrays, objects) is rejected.
export function parseProductQuery(query = {}) {
  const allowed = ['search', 'category', 'petType', 'limit', 'page'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw invalid('Query is invalid');
  const out = parsePageQuery(query);
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid('search is invalid');
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(search)) {
      throw invalid('search is invalid');
    }
    if (search) out.search = search;
  }
  if (query.category !== undefined) {
    if (!PRODUCT_CATEGORIES.includes(query.category)) throw invalid('category is invalid');
    out.category = query.category;
  }
  if (query.petType !== undefined) {
    if (!PRODUCT_PET_TYPES.includes(query.petType)) throw invalid('petType is invalid');
    out.petType = query.petType;
  }
  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!/^\d{1,3}$/.test(String(query.limit)) || limit < 1 || limit > PRODUCT_LIMITS.maxPageSize) {
      throw invalid('limit is invalid');
    }
    out.limit = limit;
  }
  return out;
}
