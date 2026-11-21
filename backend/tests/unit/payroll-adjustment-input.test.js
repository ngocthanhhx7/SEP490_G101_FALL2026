import { describe, expect, test } from '@jest/globals';
import { payrollAdjustmentInput } from '../../src/validators/payroll.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const body = (over = {}) => ({ statementId: id, expectedVersion: 0, direction: 'SUPPLEMENT', amountVnd: 100000, reason: '  Bổ sung ca làm  ', assessmentReference: '  ASSESS-001  ', ...over });

describe('SAL-IN-05 payrollAdjustmentInput', () => {
  test('accepts and trims a supplement adjustment', () => {
    expect(payrollAdjustmentInput(body())).toEqual({ statementId: id, expectedVersion: 0, direction: 'SUPPLEMENT', amountVnd: 100000, reason: 'Bổ sung ca làm', assessmentReference: 'ASSESS-001' });
  });
  test('accepts a recovery adjustment at the positive VND boundary', () => {
    expect(payrollAdjustmentInput(body({ expectedVersion: 1000000, direction: 'RECOVERY', amountVnd: 1 })).amountVnd).toBe(1);
  });
  test.each([undefined, null, 'bad', 1])('rejects a missing or malformed statementId %p', (statementId) => {
    expect(code(() => payrollAdjustmentInput(body({ statementId })))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, -1, 1.5, '1', 1000001])('rejects an invalid expectedVersion %p', (expectedVersion) => {
    expect(code(() => payrollAdjustmentInput(body({ expectedVersion })))).toBe('VALIDATION_FAILED');
  });
  test.each([0, -1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1])('rejects an invalid VND amount %p', (amountVnd) => {
    expect(code(() => payrollAdjustmentInput(body({ amountVnd })))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, '', 'BONUS'])('rejects a missing or unsupported direction %p', (direction) => {
    expect(code(() => payrollAdjustmentInput(body({ direction })))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, '', ' ', 1, 'x'.repeat(1001)])('rejects invalid adjustment reasons %p', (reason) => {
    expect(code(() => payrollAdjustmentInput(body({ reason })))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, '', ' ', 1, 'x'.repeat(161)])('rejects invalid assessment references %p', (assessmentReference) => {
    expect(code(() => payrollAdjustmentInput(body({ assessmentReference })))).toBe('VALIDATION_FAILED');
  });
  test('rejects an unknown field', () => {
    expect(code(() => payrollAdjustmentInput(body({ transferReference: 'BANK-1' })))).toBe('VALIDATION_FAILED');
  });
  test('rejects a DTO with several invalid fields', () => {
    expect(code(() => payrollAdjustmentInput({ statementId: 'bad', expectedVersion: -1, direction: 'NOPE', amountVnd: 0, reason: '', assessmentReference: '' }))).toBe('VALIDATION_FAILED');
  });
});
