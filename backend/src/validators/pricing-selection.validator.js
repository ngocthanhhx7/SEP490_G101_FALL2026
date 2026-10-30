import { exact, id, number, fail } from './pet-care.validator.js';

export function validatePricingSelection(body) {
  exact(body, ['serviceId', 'petIds', 'durationMinutes', 'visitCount', 'dayCount', 'distanceMeters'], ['serviceId', 'petIds', 'durationMinutes']);
  id(body.serviceId);
  number(body.durationMinutes, 1, 1440, true);
  number(body.visitCount ?? 1, 1, 60, true);
  if (body.dayCount !== undefined) number(body.dayCount, 1, 60, true);
  if (body.distanceMeters !== undefined) number(body.distanceMeters, 1, 1000000, true);
  if (!Array.isArray(body.petIds) || !body.petIds.length || body.petIds.length > 10 || new Set(body.petIds).size !== body.petIds.length)
    fail('VALIDATION_FAILED', 'Unique owned pets required');
  body.petIds.forEach(id);
  return { ...body, visitCount: body.visitCount ?? 1 };
}
