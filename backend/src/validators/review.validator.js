import { AppError } from '../utils/app-error.js';
export function body(req, allowed) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => !allowed.includes(key))
  ) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Review request is invalid');
  }
  return req.body;
}
