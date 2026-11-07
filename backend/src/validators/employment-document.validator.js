import { fail } from './pet-care.validator.js';
import { AppError } from '../utils/app-error.js';
export function contractFieldError(fields, code = 'VALIDATION_FAILED') {
  throw new AppError(422, code, 'Check the indicated contract fields', { fields });
}
export const CONTRACT_TEXT_FIELDS = ['employerName', 'employerAddress', 'employerPhone', 'employerEmail', 'registrationNumber', 'representativeName', 'representativeTitle', 'authorityBasis',
  'employeeName', 'employeePhone', 'employeeEmail', 'nationality', 'dateOfBirth', 'gender', 'residence', 'identityNumber', 'identityIssuedOn', 'identityIssuedBy',
  'jobTitle', 'duties', 'workplace', 'workplaceReference', 'signingPlace', 'plannedSigningOn', 'effectiveOn', 'payMethod', 'paySchedule',
  'salaryReview', 'restRules', 'protection', 'insurance', 'training'];
const text = value => typeof value === 'string' && value.trim() && value.length <= 2000 && !/[\x00-\x1f\x7f]/.test(value);
export function normalizeContractGender(value) {
  if (typeof value !== 'string' || value.length > 30) return null;
  const normalized = value.normalize('NFC').trim().toLowerCase();
  return ['Nam', 'Nữ', 'Khác'].find(gender => gender.toLowerCase() === normalized) ?? null;
}
export function contractDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    fail('VALIDATION_FAILED', 'Valid calendar date required');
  return new Date(value + 'T00:00:00+07:00');
}
export function employmentTermsInput(value, now) {
  const numeric = ['monthlyBaseVnd', 'monthlyAllowanceVnd', 'workplaceRegion'];
  const fields = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) contractFieldError({ terms: 'REQUIRED' });
  for (const key of CONTRACT_TEXT_FIELDS) if (!text(value[key])) fields[key] = 'REQUIRED_TEXT';
  const gender = normalizeContractGender(value.gender);
  if (!gender) fields.gender = 'INVALID_GENDER';
  for (const key of numeric) if (!Number.isSafeInteger(value[key]) || value[key] < (key === 'monthlyAllowanceVnd' ? 0 : 1) || value[key] > (key === 'workplaceRegion' ? 4 : 1000000000)) fields[key] = 'WHOLE_NUMBER';
  if (!['FULL_TIME', 'PART_TIME'].includes(value.employmentType)) fields.employmentType = 'INVALID';
  if (!['INDEFINITE', 'FIXED'].includes(value.termType)) fields.termType = 'INVALID';
  const dates = {};
  for (const key of ['effectiveOn', 'plannedSigningOn', 'dateOfBirth', 'identityIssuedOn', ...(value.termType === 'FIXED' ? ['endsOn'] : [])]) {
    try { dates[key] = contractDate(value[key]); } catch { fields[key] = 'CALENDAR_DATE'; }
  }
  const adultLimit = new Date(now); adultLimit.setUTCFullYear(adultLimit.getUTCFullYear() - 18);
  if (dates.plannedSigningOn > dates.effectiveOn) fields.plannedSigningOn = 'SIGN_BEFORE_EFFECTIVE';
  if (dates.dateOfBirth > adultLimit || dates.dateOfBirth < new Date('1900-01-01')) fields.dateOfBirth = 'ADULT_REQUIRED';
  if (dates.identityIssuedOn > now || dates.identityIssuedOn < dates.dateOfBirth) fields.identityIssuedOn = 'IDENTITY_DATE';
  if (dates.effectiveOn < new Date('2026-01-01T00:00:00+07:00')) fields.effectiveOn = 'EFFECTIVE_DATE';
  if (typeof value.identityNumber === 'string' && !/^[A-Za-z0-9]{8,20}$/.test(value.identityNumber.trim())) fields.identityNumber = 'IDENTITY_NUMBER';
  if (value.termType === 'FIXED' && dates.endsOn && dates.effectiveOn) {
    const maximum = new Date(dates.effectiveOn); maximum.setUTCFullYear(maximum.getUTCFullYear() + 3);
    if (dates.endsOn <= dates.effectiveOn || dates.endsOn > maximum) fields.endsOn = 'FIXED_TERM_RANGE';
  } else if (value.termType === 'INDEFINITE' && value.endsOn) fields.endsOn = 'INDEFINITE_NO_END';
  if (Object.keys(value).some(key => ![...CONTRACT_TEXT_FIELDS, ...numeric, 'employmentType', 'termType', 'endsOn'].includes(key))) fields.terms = 'UNEXPECTED_FIELDS';
  if (Object.keys(fields).length) contractFieldError(fields, !fields.terms && CONTRACT_TEXT_FIELDS.some(key => fields[key] === 'REQUIRED_TEXT') ? 'CONTRACT_INFORMATION_REQUIRED' : 'VALIDATION_FAILED');
  if (value.nationality !== 'Việt Nam') fail('CONTRACT_SPECIAL_REVIEW_REQUIRED', 'This template requires Vietnamese adult employee; review other categories separately', 422);
  const result = Object.fromEntries(CONTRACT_TEXT_FIELDS.map(key => [key, value[key].trim()]));
  const weeklyMinutes = value.employmentType === 'FULL_TIME' ? 2400 : 1200;
  const floorMonth = [5310000, 4730000, 4140000, 3700000][value.workplaceRegion - 1], floorHour = [25500, 22700, 20000, 17800][value.workplaceRegion - 1];
  if ((value.employmentType === 'FULL_TIME' && value.monthlyBaseVnd < floorMonth) || BigInt(value.monthlyBaseVnd) * 12n * 60n < BigInt(floorHour) * BigInt(weeklyMinutes) * 52n)
    contractFieldError({ monthlyBaseVnd: 'BELOW_MINIMUM_WAGE' }, 'BELOW_MINIMUM_WAGE');
  if (value.termType === 'FIXED') {
    result.endsOn = value.endsOn;
  }
  return { ...result, gender, ...Object.fromEntries(numeric.map(key => [key, value[key]])), employmentType: value.employmentType, termType: value.termType,
    workScheduleMode: 'SELF_REGISTERED', minimumWeeklyMinutes: weeklyMinutes, weeklyMinutes, salaryBasis: 'GROSS', payCycle: 'MONTHLY' };
}
