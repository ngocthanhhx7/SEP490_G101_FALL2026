import { describe, expect, test } from '@jest/globals';
import { contractInput } from '../../src/validators/payroll.validator.js';
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const id = 'a'.repeat(24);
const body = (over = {}) => ({ employeeId: id, expectedVersion: 0, employmentType: 'FULL_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 10000000, payCycle: 'MONTHLY', weeklyMinutes: 2400, signedAt: '2026-11-01T00:00:00Z', effectiveAt: '2026-11-02T00:00:00Z', contractReference: ' C-1 ', workplaceRegion: 1, workplaceReference: ' HN-1 ', ...over });

describe('SAL-IN-01 contractInput', () => {
  test('accepts and normalizes a full-time contract', () => { const result = contractInput(body()); expect(result.contractReference).toBe('C-1'); expect(result.signedAt).toEqual(new Date('2026-11-01T00:00:00Z')); });
  test.each([
    ['FULL_TIME', 10000000, 2400],
    ['PART_TIME', 3000000, 1200]
  ])('%s accepts MONTHLY and rejects WEEKLY with the same weekly work minutes', (employmentType, monthlyBaseVnd, weeklyMinutes) => {
    const terms = { employmentType, monthlyBaseVnd, weeklyMinutes };
    expect(contractInput(body(terms))).toMatchObject({ ...terms, payCycle: 'MONTHLY' });
    expect(() => contractInput(body({ ...terms, payCycle: 'WEEKLY' })))
      .toThrow('Pet sitter contracts require monthly pay');
  });
  test.each([undefined, null, -1, 1.5, '0', 1000001])('rejects invalid expectedVersion %p', expectedVersion => expect(code(() => contractInput(body({ expectedVersion })))).toBe('VALIDATION_FAILED'));
  test.each([0, -1, 1.5, '10000000'])('rejects invalid money %p', monthlyBaseVnd => expect(code(() => contractInput(body({ monthlyBaseVnd })))).toBe('VALIDATION_FAILED'));
  test.each([0, 2881, 1.5, '2400'])('rejects invalid weekly minutes %p', weeklyMinutes => expect(code(() => contractInput(body({ weeklyMinutes })))).toBe('VALIDATION_FAILED'));
  test('rejects full-time weekly minutes below the SRS minimum', () =>
    expect(code(() => contractInput(body({ weeklyMinutes: 2399 })))).toBe('VALIDATION_FAILED'));
  test('rejects enum, agreement, date, reference and extra-field violations', () => {
    expect(code(() => contractInput(body({ employmentType: 'CASUAL' })))).toBe('VALIDATION_FAILED');
    expect(code(() => contractInput(body({ monthlyBaseVnd: 1 })))).toBe('VALIDATION_FAILED');
    expect(code(() => contractInput(body({ signedAt: '2026-11-03T00:00:00Z' })))).toBe('VALIDATION_FAILED');
    expect(code(() => contractInput(body({ contractReference: ' ' })))).toBe('VALIDATION_FAILED');
    expect(code(() => contractInput(body({ extra: true })))).toBe('VALIDATION_FAILED');
  });
  test('ST-ONB-14 rejects endsAt on or before effectiveAt with fieldErrors.endsAt (MSG87)', () => {
    for (const endsAt of ['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z']) {
      let caught;
      try { contractInput(body({ endsAt })); } catch (error) { caught = error; }
      expect(caught).toMatchObject({
        status: 422,
        code: 'VALIDATION_FAILED',
        details: { fieldErrors: { endsAt: 'Ngày kết thúc phải sau ngày bắt đầu.' } }
      });
    }
  });
});
