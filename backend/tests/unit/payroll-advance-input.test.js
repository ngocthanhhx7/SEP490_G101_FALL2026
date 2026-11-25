import { describe, expect, test } from '@jest/globals';
import { advanceInput } from '../../src/validators/payroll.validator.js';
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const body = (over = {}) => ({ amountVnd: 1, reason: ' Tạm ứng ', settlementPeriod: '2026-11', settlementConsentReference: ' AG-1 ', ...over });

describe('SAL-IN-02 advanceInput', () => {
  test('accepts and trims valid advance DTO', () => expect(advanceInput(body())).toEqual({ amountVnd: 1, reason: 'Tạm ứng', settlementPeriod: '2026-11', settlementConsentReference: 'AG-1' }));
  test.each([0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])('rejects invalid VND amount %p', amountVnd => expect(code(() => advanceInput(body({ amountVnd })))).toBe('VALIDATION_FAILED'));
  test.each(['2026-00', '2026-13', '2026-1', '', null, 1])('rejects invalid settlement period %p', settlementPeriod => expect(code(() => advanceInput(body({ settlementPeriod })))).toBe('VALIDATION_FAILED'));
  test.each([undefined, null, '', ' ', 1, 'x'.repeat(1001)])('rejects invalid reason %p', reason => expect(code(() => advanceInput(body({ reason })))).toBe('VALIDATION_FAILED'));
  test.each([undefined, null, '', ' ', 1, 'x'.repeat(161)])('rejects invalid consent reference %p', settlementConsentReference => expect(code(() => advanceInput(body({ settlementConsentReference })))).toBe('VALIDATION_FAILED'));
  test('rejects extra and multiple invalid fields', () => { expect(code(() => advanceInput(body({ extra: true })))).toBe('VALIDATION_FAILED'); expect(code(() => advanceInput({ amountVnd: 0, reason: '', settlementPeriod: '2026-13', settlementConsentReference: '' }))).toBe('VALIDATION_FAILED'); });
});
