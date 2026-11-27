import { describe, expect, test } from '@jest/globals';
import { schedulingKey } from '../../src/validators/employee-scheduling.validator.js';
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('SHIFT-IN-06 schedulingKey', () => {
  test.each(['abc12345', 'A._:-z09', 'x'.repeat(128)])('accepts valid key %s', value => expect(schedulingKey(value)).toBe(value));
  test.each([undefined, null, '', '       ', 'short', 'x'.repeat(129), 'has space', 'đ'.repeat(8), 1])('rejects invalid key %p', value => expect(code(() => schedulingKey(value))).toBe('VALIDATION_FAILED'));
});
