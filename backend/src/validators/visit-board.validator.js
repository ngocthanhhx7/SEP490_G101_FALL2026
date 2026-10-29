import { AppError } from '../utils/app-error.js';
export const body = (req, fields) => {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => !fields.includes(key))
  )
    throw new AppError(
      422,
      'VALIDATION_FAILED',
      'Visit board request is invalid'
    );
  if (
    fields.includes('sitterId') &&
    !/^[a-f0-9]{24}$/.test(req.body.sitterId ?? '')
  )
    throw new AppError(422, 'VALIDATION_FAILED', 'Sitter ID is invalid');
  return req.body;
};
