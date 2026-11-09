import { exact, id, number, fail } from './pet-care.validator.js';
const text = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail('VALIDATION_FAILED', 'Invalid text'); };
export function sitterCapabilityInput(body) {
  const fields = ['expectedVersion', 'serviceIds', 'species', 'allowedTraits', 'maxPets', 'maxWeightKg', 'active', 'reason'];
  exact(body, fields, fields);
  number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
  number(body.maxPets, 1, 10, true); number(body.maxWeightKg, 0.1, 150);
  text(body.reason, 1000);
  if (body.reason.trim().length < 3 || typeof body.active !== 'boolean') fail('VALIDATION_FAILED', 'Verification reason required');
  for (const key of ['serviceIds', 'species', 'allowedTraits']) {
    if (!Array.isArray(body[key]) || body[key].length > 60 || new Set(body[key]).size !== body[key].length) fail('VALIDATION_FAILED', 'Bounded unique selections required');
  }
  if (!body.serviceIds.length || !body.species.length || body.species.some(value => !['DOG', 'CAT'].includes(value))) fail('VALIDATION_FAILED', 'Choose services and species');
  body.serviceIds.forEach(id); body.allowedTraits.forEach(value => text(value, 80));
  return { ...body, reason: body.reason.trim() };
}
