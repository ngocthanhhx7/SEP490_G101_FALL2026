import { describe, expect, test } from '@jest/globals';
import { payrollAdjustmentDecisionInput } from '../../src/validators/payroll.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('SAL-IN-06 payrollAdjustmentDecisionInput', () => {
  test.each(['APPROVE', 'REJECT'])('accepts %s with a decision reason', (action) => {
    expect(payrollAdjustmentDecisionInput({ action, expectedVersion: 0, reason: '  Đã đối chiếu  ' }))
      .toEqual({ action, expectedVersion: 0, reason: 'Đã đối chiếu' });
  });
  test('accepts RECORD_PAYMENT with its transfer reference only', () => {
    expect(payrollAdjustmentDecisionInput({ action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: '  BANK-001  ' }))
      .toEqual({ action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'BANK-001' });
  });
  test('accepts RECONCILE with agreement and resolution references only', () => {
    expect(payrollAdjustmentDecisionInput({ action: 'RECONCILE', expectedVersion: 2, agreementReference: 'AGREE-001', resolutionReference: 'RESOLVE-001' }))
      .toEqual({ action: 'RECONCILE', expectedVersion: 2, agreementReference: 'AGREE-001', resolutionReference: 'RESOLVE-001' });
  });
  test.each([{ expectedVersion: 1 }, { action: 'APPROVE' }, { action: null, expectedVersion: 1 }])('rejects missing action or version %p', (body) => {
    expect(code(() => payrollAdjustmentDecisionInput(body))).toBe('VALIDATION_FAILED');
  });
  test.each(['PAY', '', 1])('rejects an unsupported action %p', (action) => {
    expect(code(() => payrollAdjustmentDecisionInput({ action, expectedVersion: 1 }))).toBe('VALIDATION_FAILED');
  });
  test.each([-1, 1.5, '1', null, 1000001])('rejects an invalid expectedVersion %p', (expectedVersion) => {
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'APPROVE', expectedVersion, reason: 'OK' }))).toBe('VALIDATION_FAILED');
  });
  test.each(['', ' ', null, 1])('requires a valid reason for APPROVE or REJECT %p', (reason) => {
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'APPROVE', expectedVersion: 1, reason }))).toBe('VALIDATION_FAILED');
  });
  test.each(['', ' ', null, 1, 'x'.repeat(161)])('requires a valid transfer reference for RECORD_PAYMENT %p', (transferReference) => {
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference }))).toBe('VALIDATION_FAILED');
  });
  test('requires both reconciliation references', () => {
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'RECONCILE', expectedVersion: 1, agreementReference: 'A' }))).toBe('VALIDATION_FAILED');
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'RECONCILE', expectedVersion: 1, agreementReference: 'A', resolutionReference: ' ' }))).toBe('VALIDATION_FAILED');
  });
  test('rejects evidence that does not belong to its action', () => {
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'APPROVE', expectedVersion: 1, reason: 'OK', transferReference: 'BANK-1' }))).toBe('VALIDATION_FAILED');
  });
  test('rejects unknown fields and multiple invalid values', () => {
    expect(code(() => payrollAdjustmentDecisionInput({ action: 'NOPE', expectedVersion: -1, amountVnd: 1 }))).toBe('VALIDATION_FAILED');
  });
});
