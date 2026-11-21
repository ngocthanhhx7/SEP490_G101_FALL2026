import { describe, expect, test } from '@jest/globals';
import { decisionInput } from '../../src/validators/employee-scheduling.validator.js';
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('SHIFT-IN-04 decisionInput', () => {
  test.each([0, 1, 1000000])('UTCID%# accepts expectedVersion %p', (expectedVersion) => expect(decisionInput({ expectedVersion })).toEqual({ expectedVersion }));
  test.each([undefined, null, -1, 1.5, '1', 1000001])('rejects invalid expectedVersion %p', (expectedVersion) => expect(code(() => decisionInput({ expectedVersion }))).toBe('VALIDATION_FAILED'));
  test('rejects unexpected fields', () => expect(code(() => decisionInput({ expectedVersion: 0, action: 'APPROVE' }))).toBe('VALIDATION_FAILED'));
  test('rejects non-object DTOs', () => expect(code(() => decisionInput([]))).toBe('VALIDATION_FAILED'));
});
