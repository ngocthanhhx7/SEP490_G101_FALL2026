import { APPLICATION_CHECKS, INTERVIEW_OUTCOMES } from '../constants/sitter-application-assessment.js';
import { exact, fail, number } from './pet-care.validator.js';

const FIELDS = ['expectedVersion', 'expectedAssessmentVersion', 'checklist', 'callAt', 'outcome'];
const ZONED_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function callTime(value) {
  if (value === null) return null;
  const day = typeof value === 'string' && ZONED_TIMESTAMP.exec(value)?.[1];
  const time = day && new Date(value);
  if (!time || !Number.isFinite(time.getTime()) || new Date(day).toISOString().slice(0, 10) !== day) {
    fail('VALIDATION_FAILED', 'Interview call time must be a valid timestamp with a time zone');
  }
  return time;
}

export function validateApplicationAssessment(body) {
  exact(body, FIELDS, FIELDS);
  number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER - 1, true);
  number(body.expectedAssessmentVersion, 0, Number.MAX_SAFE_INTEGER - 1, true);
  exact(body.checklist, APPLICATION_CHECKS, APPLICATION_CHECKS);
  if (APPLICATION_CHECKS.some(check => typeof body.checklist[check] !== 'boolean')) {
    fail('VALIDATION_FAILED', 'Each application check must be a boolean');
  }
  if (body.outcome !== null && !INTERVIEW_OUTCOMES.includes(body.outcome)) {
    fail('VALIDATION_FAILED', 'Unknown interview outcome');
  }
  return {
    expectedVersion: body.expectedVersion, expectedAssessmentVersion: body.expectedAssessmentVersion,
    checklist: Object.fromEntries(APPLICATION_CHECKS.map(check => [check, body.checklist[check]])),
    callAt: callTime(body.callAt), outcome: body.outcome
  };
}
