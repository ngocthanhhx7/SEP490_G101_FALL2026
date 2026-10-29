import { ID } from '../constants/sitter-operations-fields.js';

import { AppError } from '../utils/app-error.js';
export function body(req, allowed, required = []) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(req.body, key))
  ) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Sitter operation is invalid');
  }
  return req.body;
}

export function resourceId(value, field) {
  if (typeof value !== 'string' || !ID.test(value))
    throw new AppError(422, 'VALIDATION_FAILED', `${field} is invalid`);
  return value;
}
