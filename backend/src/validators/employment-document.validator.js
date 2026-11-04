import { exact, fail, number } from './pet-care.validator.js';
export const CONTRACT_TEXT_FIELDS = ['employerName', 'employerAddress', 'employerPhone', 'employerEmail', 'registrationNumber', 'representativeName', 'representativeTitle', 'authorityBasis',
  'employeeName', 'employeePhone', 'employeeEmail', 'nationality', 'dateOfBirth', 'gender', 'residence', 'identityNumber', 'identityIssuedOn', 'identityIssuedBy',
  'jobTitle', 'duties', 'workplace', 'workplaceReference', 'signingPlace', 'plannedSigningOn', 'effectiveOn', 'payMethod', 'paySchedule',
  'salaryReview', 'restRules', 'protection', 'insurance', 'training'];
const text = value => typeof value === 'string' && value.trim() && value.length <= 2000 && !/[\x00-\x1f\x7f]/.test(value);
export function contractDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    fail('VALIDATION_FAILED', 'Valid calendar date required');
  return new Date(value + 'T00:00:00+07:00');
}
export function employmentTermsInput(value, now) {
  const numeric = ['monthlyBaseVnd', 'monthlyAllowanceVnd', 'dailyMinutes', 'workplaceRegion'];
  exact(value, [...CONTRACT_TEXT_FIELDS, ...numeric, 'employmentType', 'termType', 'endsOn', 'weekdays'], [...CONTRACT_TEXT_FIELDS, ...numeric, 'employmentType', 'termType', 'weekdays']);
  if (!CONTRACT_TEXT_FIELDS.every(key => text(value[key]))) fail('CONTRACT_INFORMATION_REQUIRED', 'Complete all contract information', 422);
  if (value.nationality !== 'Việt Nam') fail('CONTRACT_SPECIAL_REVIEW_REQUIRED', 'This template requires Vietnamese adult employee; review other categories separately', 422);
  const result = Object.fromEntries(CONTRACT_TEXT_FIELDS.map(key => [key, value[key].trim()]));
  if (!['FULL_TIME', 'PART_TIME'].includes(value.employmentType) || !['INDEFINITE', 'FIXED'].includes(value.termType)) fail('VALIDATION_FAILED', 'Invalid contract type');
  if (!Array.isArray(value.weekdays) || !value.weekdays.length || value.weekdays.length > 6 || new Set(value.weekdays).size !== value.weekdays.length || value.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) fail('VALIDATION_FAILED', 'Choose up to six distinct working weekdays');
  number(value.dailyMinutes, 30, 480, true); number(value.workplaceRegion, 1, 4, true);
  number(value.monthlyBaseVnd, 1, 1000000000, true); number(value.monthlyAllowanceVnd, 0, 1000000000, true);
  const effectiveAt = contractDate(value.effectiveOn), plannedSigningAt = contractDate(value.plannedSigningOn), birth = contractDate(value.dateOfBirth), issued = contractDate(value.identityIssuedOn);
  const adultLimit = new Date(now); adultLimit.setUTCFullYear(adultLimit.getUTCFullYear() - 18);
  if (plannedSigningAt > effectiveAt || birth > adultLimit || birth < new Date('1900-01-01') || issued > now || issued < birth || effectiveAt < new Date('2026-01-01T00:00:00+07:00')) fail('VALIDATION_FAILED', 'Unsupported birth, identity or effective date');
  if (!/^[A-Za-z0-9]{8,20}$/.test(value.identityNumber)) fail('VALIDATION_FAILED', 'Identity number required');
  const weeklyMinutes = value.dailyMinutes * value.weekdays.length;
  const floorMonth = [5310000, 4730000, 4140000, 3700000][value.workplaceRegion - 1], floorHour = [25500, 22700, 20000, 17800][value.workplaceRegion - 1];
  if ((value.employmentType === 'FULL_TIME' && value.monthlyBaseVnd < floorMonth) || BigInt(value.monthlyBaseVnd) * 12n * 60n < BigInt(floorHour) * BigInt(weeklyMinutes) * 52n)
    fail('BELOW_MINIMUM_WAGE', 'Salary below applicable regional floor', 422);
  if (value.termType === 'FIXED') {
    const ends = contractDate(value.endsOn), maximum = new Date(effectiveAt); maximum.setUTCFullYear(maximum.getUTCFullYear() + 3);
    if (ends <= effectiveAt || ends > maximum) fail('VALIDATION_FAILED', 'Fixed term must end within 36 months');
    result.endsOn = value.endsOn;
  } else if (value.endsOn) fail('VALIDATION_FAILED', 'Indefinite contract has no end date');
  return { ...result, ...Object.fromEntries(numeric.map(key => [key, value[key]])), employmentType: value.employmentType, termType: value.termType,
    weekdays: [...value.weekdays].sort(), weeklyMinutes, salaryBasis: 'GROSS', payCycle: 'MONTHLY' };
}
