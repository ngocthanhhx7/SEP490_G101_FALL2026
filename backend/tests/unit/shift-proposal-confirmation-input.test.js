import { describe, expect, test } from '@jest/globals';
import { proposalConfirmationInput } from '../../src/validators/employee-scheduling.validator.js';
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const body = (over = {}) => ({ expectedVersion: 0, selectedSlot: { startAt: '2026-11-18T08:00:00+07:00', endAt: '2026-11-18T09:00:00+07:00' }, ...over });

describe('SHIFT-IN-05 proposalConfirmationInput', () => {
  test('accepts a timezone-aware selected slot', () => expect(proposalConfirmationInput(body())).toEqual(body()));
  test.each([undefined, null, -1, 1.5, '0', 1000001])('rejects invalid version %p', expectedVersion => expect(code(() => proposalConfirmationInput(body({ expectedVersion })))).toBe('VALIDATION_FAILED'));
  test.each([undefined, null, [], {}, { startAt: '2026-11-18T08:00:00+07:00' }, { startAt: 'x', endAt: 'x' }])('rejects malformed selectedSlot %p', selectedSlot => expect(code(() => proposalConfirmationInput(body({ selectedSlot })))).toBe('VALIDATION_FAILED'));
  test('rejects timezone-less timestamps and unknown fields', () => {
    expect(code(() => proposalConfirmationInput(body({ selectedSlot: { startAt: '2026-11-18T08:00:00', endAt: '2026-11-18T09:00:00+07:00' } })))).toBe('VALIDATION_FAILED');
    expect(code(() => proposalConfirmationInput(body({ note: 'x' })))).toBe('VALIDATION_FAILED');
  });
});
