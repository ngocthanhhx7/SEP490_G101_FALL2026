import { describe, expect, test } from '@jest/globals';
import { normalizeRegistrationContact } from '../../src/services/customer-registration-api.js';

describe('FE-REG-01 normalizeRegistrationContact', () => {
  test.each([
    ['UTCID01', 'EMAIL', ' HELLO@PawWorld.com ', 'hello@pawworld.com'],
    ['UTCID02', 'PHONE', '+1 (202) 555-0123', '+12025550123'],
    ['UTCID03', 'PHONE', '0912 345 678', '+84912345678'],
    ['UTCID04', 'PHONE', '84912345678', '+84912345678']
  ])('%s normalizes a supported contact', (_id, channel, value, expected) => {
    expect(normalizeRegistrationContact(channel, value)).toBe(expected);
  });

  test.each([
    ['UTCID05', 'EMAIL', 'bad-address'], ['UTCID06', 'EMAIL', 'a@localhost'], ['UTCID07', 'PHONE', '123'],
    ['UTCID08', 'PHONE', '+0012345678'], ['UTCID09', 'SMS', 'a@example.test'], ['UTCID10', 'EMAIL', null]
  ])('%s rejects unsupported or malformed contact input', (_id, channel, value) => {
    expect(normalizeRegistrationContact(channel, value)).toBeNull();
  });
});
