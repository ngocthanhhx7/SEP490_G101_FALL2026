import { expect, test } from '@jest/globals';
import { createGuestIntakeService } from '../../src/services/applications/guest-intake.service.js';

test('intake is a signed document capability, reusable until expiry and independent of an account', () => {
  let now = Date.now();
  const service = createGuestIntakeService({ secret: 'synthetic-secret-'.repeat(3), clock: () => now });
  const intake = service.open();
  expect(service.open(intake.token)).toEqual(intake);
  expect(service.authenticate(intake.token, intake.csrfToken)).toEqual({ userId: intake.userId });
  for (const token of ['', intake.token + 'x', intake.token.replace(intake.userId, 'a'.repeat(24))])
    expect(() => service.authenticate(token, intake.csrfToken)).toThrow(expect.objectContaining({ code: 'INTAKE_VERIFICATION_REQUIRED' }));
  for (const csrf of ['', 'a'.repeat(64), 'é'.repeat(64)])
    expect(() => service.authenticate(intake.token, csrf)).toThrow(expect.objectContaining({ code: 'INTAKE_VERIFICATION_REQUIRED' }));
  now += 7200000;
  expect(() => service.authenticate(intake.token, intake.csrfToken)).toThrow(expect.objectContaining({ code: 'INTAKE_VERIFICATION_REQUIRED' }));
  expect(service.open(intake.token).userId).not.toBe(intake.userId);
});
