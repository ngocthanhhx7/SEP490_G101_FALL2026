import { exact, fail, number } from './pet-care.validator.js';

export const CARE_PROFILE_KEYS = ['feeding', 'handling', 'health', 'allergies', 'medication', 'vaccination', 'emergencyContact', 'veterinaryContact'];

export function careProfileInput(body) {
  const result = {};
  if (body.ageMonths !== undefined) result.ageMonths = number(body.ageMonths, 0, 600, true);
  if (body.sex !== undefined) {
    if (!['MALE', 'FEMALE', 'UNKNOWN'].includes(body.sex)) fail('VALIDATION_FAILED', 'Invalid sex');
    result.sex = body.sex;
  }
  if (body.careProfile !== undefined) {
    exact(body.careProfile, CARE_PROFILE_KEYS);
    result.careProfile = {};
    for (const [key, field] of Object.entries(body.careProfile)) {
      exact(field, ['status', 'value'], ['status']);
      if (!['KNOWN', 'UNKNOWN', 'NOT_PROVIDED'].includes(field.status)) fail('VALIDATION_FAILED', 'Invalid care status');
      if (field.status === 'KNOWN') {
        if (typeof field.value !== 'string' || !field.value.trim() || field.value.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(field.value))
          fail('VALIDATION_FAILED', 'Care information required');
        result.careProfile[key] = { status: field.status, value: field.value.trim() };
      } else {
        if (field.value !== undefined && field.value !== '') fail('VALIDATION_FAILED', 'Unknown care information cannot have a value');
        result.careProfile[key] = { status: field.status };
      }
    }
  }
  return result;
}
