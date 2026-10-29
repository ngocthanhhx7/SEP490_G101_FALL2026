import { AppError } from '../utils/app-error.js';
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
      'Notification request is invalid'
    );
  }
  return req.body;
}
