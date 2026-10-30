import { AppError } from '../utils/app-error.js';

const invalid = () => { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid public profile command'); };
const text = (value, max) => typeof value === 'string' && value.trim().length > 0
  && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
export function validatePublicProfileCommand(body, operation) {
  const fields = operation === 'SUBMIT' ? ['bio', 'areas', 'expectedVersion'] : ['decision', 'reason', 'expectedVersion'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !fields.includes(key))
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) invalid();
  if (operation === 'SUBMIT') {
    if (!text(body.bio, 1000) || !Array.isArray(body.areas) || body.areas.length < 1 || body.areas.length > 30
      || !body.areas.every(area => text(area, 100))) invalid();
    const areas = body.areas.map(area => area.trim());
    if (new Set(areas).size !== areas.length) invalid();
    return { bio: body.bio.trim(), areas, expectedVersion: body.expectedVersion };
  }
  if (!['APPROVE', 'REJECT'].includes(body.decision) || !text(body.reason, 500)) invalid();
  return { decision: body.decision, reason: body.reason.trim(), expectedVersion: body.expectedVersion };
}
