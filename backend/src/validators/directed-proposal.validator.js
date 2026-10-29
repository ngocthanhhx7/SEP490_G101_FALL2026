import { IDENTIFIER } from '../constants/directed-proposal-fields.js';

import { AppError } from '../utils/app-error.js';
export function parameter(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', `${label} is invalid`);
  }
  return value;
}
export function body(req, fields) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => !fields.includes(key))
  ) {
    throw new AppError(
      422,
      'VALIDATION_FAILED',
      'Directed proposal request is invalid'
    );
  }
  return req.body;
}
