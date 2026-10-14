import { AppError } from '../utils/app-error.js';

// Domain modules supply their own schema and resource authorization to P34.
export function validateCommand(validate) {
  if (typeof validate !== 'function') throw new TypeError('A domain validator is required');
  return (req, _res, next) => {
    if (!validate(req.body)) return next(new AppError(422, 'VALIDATION_FAILED', 'Command validation failed'));
    next();
  };
}
