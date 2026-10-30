import { AppError } from '../utils/app-error.js';

export function validateFinanceSourceInput(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !fields.includes(key))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Unsupported source command fields');
  }
  return input;
}
