import { describe, expect, test } from '@jest/globals';
import { advanceDecisionInput } from '../../src/validators/payroll.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('SAL-IN-03 advanceDecisionInput', () => {
  test('accepts APPROVE and WITHDRAW with version zero', () => {
    expect(advanceDecisionInput({ expectedVersion: 0, action: 'APPROVE' })).toEqual({ expectedVersion: 0, action: 'APPROVE' });
    expect(advanceDecisionInput({ expectedVersion: 0, action: 'WITHDRAW' })).toEqual({ expectedVersion: 0, action: 'WITHDRAW' });
  });
  test('requires and trims a rejection reason', () => {
    expect(advanceDecisionInput({ expectedVersion: 1, action: 'REJECT', reason: '  Không đủ điều kiện  ' }))
      .toEqual({ expectedVersion: 1, action: 'REJECT', reason: 'Không đủ điều kiện' });
  });
  test('requires and trims a payment transfer reference', () => {
    expect(advanceDecisionInput({ expectedVersion: 2, action: 'RECORD_PAYMENT', transferReference: '  BANK-001  ' }))
      .toEqual({ expectedVersion: 2, action: 'RECORD_PAYMENT', transferReference: 'BANK-001' });
  });
  test.each([{ expectedVersion: 1 }, { expectedVersion: 1, action: null }, { expectedVersion: 1, action: 1 }])('rejects missing or non-string action %p', (body) => {
    expect(code(() => advanceDecisionInput(body))).toBe('VALIDATION_FAILED');
  });
  test.each(['APPROVED', '', 'PAY'])('rejects an unsupported action %p', (action) => {
    expect(code(() => advanceDecisionInput({ expectedVersion: 1, action }))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, -1, 1.5, '1', 1000001])('rejects an invalid expectedVersion %p', (expectedVersion) => {
    expect(code(() => advanceDecisionInput({ expectedVersion, action: 'APPROVE' }))).toBe('VALIDATION_FAILED');
  });
  test.each(['', ' ', null, 1])('rejects a missing or invalid rejection reason %p', (reason) => {
    expect(code(() => advanceDecisionInput({ expectedVersion: 1, action: 'REJECT', reason }))).toBe('VALIDATION_FAILED');
  });
  test.each(['', ' ', null, 1, 'x'.repeat(161)])('rejects a missing, invalid or overlong transfer reference %p', (transferReference) => {
    expect(code(() => advanceDecisionInput({ expectedVersion: 1, action: 'RECORD_PAYMENT', transferReference }))).toBe('VALIDATION_FAILED');
  });
  test('preserves an allowed optional field for a non-dependent action', () => {
    expect(advanceDecisionInput({ expectedVersion: 1, action: 'APPROVE', reason: 'Ghi chú' }))
      .toEqual({ expectedVersion: 1, action: 'APPROVE', reason: 'Ghi chú' });
  });
  test('rejects unknown fields and a DTO with several invalid values', () => {
    expect(code(() => advanceDecisionInput({ expectedVersion: -1, action: 'NOPE', amountVnd: -1 }))).toBe('VALIDATION_FAILED');
  });
});
