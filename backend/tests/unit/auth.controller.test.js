import { describe, expect, jest, test } from '@jest/globals';
import { createAuthController } from '../../src/controllers/auth.controller.js';

const request = {
  auth: {
    userId: 'customer-1',
    sessionId: 'session-1',
    state: 'ACTIVE',
    roles: ['CUSTOMER']
  }
};

function createFixture({ secureCookies = true } = {}) {
  const revoke = jest.fn();
  const clearCookie = jest.fn();
  const setCookie = jest.fn();
  const sendStatus = jest.fn();

  const sessionService = { revoke, clearCookie, setCookie };
  const accountSettingsService = { listVerifiedContacts: jest.fn() };
  const otpService = { begin: jest.fn(), verify: jest.fn() };
  const response = {
    clearCookie,
    sendStatus,
    status: jest.fn(),
    json: jest.fn()
  };
  response.status.mockReturnValue(response);

  const controller = createAuthController({
    sessionService,
    accountSettingsService,
    otpService,
    secureCookies
  });

  return { controller, sessionService, accountSettingsService, otpService, response };
}

describe('AUTH-CTL-01 getMe', () => {
  const user = {
    id: 'customer-1',
    displayName: 'Synthetic Customer',
    roles: ['CUSTOMER']
  };
  const contacts = [{
    id: 'contact-1',
    channel: 'EMAIL',
    value: 's*****@example.test',
    state: 'VERIFIED',
    verifiedAt: '2026-11-10T00:00:00.000Z'
  }];

  function setup({ csrfToken, resumeCsrf = true } = {}) {
    const fixture = createFixture();
    const req = { ...request, requestId: 'request-01' };
    fixture.sessionService.getCurrentUser = jest.fn().mockResolvedValue(user);
    fixture.accountSettingsService.listVerifiedContacts.mockResolvedValue(contacts);
    if (resumeCsrf) {
      fixture.sessionService.resumeCsrf = jest.fn().mockResolvedValue(csrfToken);
    }
    return { ...fixture, req };
  }

  test('TC-AUTH-CTL-01-01 returns the current user, masked verified contacts and session CSRF token', async () => {
    const { controller, sessionService, accountSettingsService, response, req } = setup({
      csrfToken: 'csrf-session-token'
    });

    await controller.getMe(req, response);

    expect(sessionService.getCurrentUser).toHaveBeenCalledWith(req.auth);
    expect(accountSettingsService.listVerifiedContacts).toHaveBeenCalledWith(req.auth);
    expect(sessionService.resumeCsrf).toHaveBeenCalledWith(req, req.auth);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { user, contacts, csrfToken: 'csrf-session-token' },
      meta: expect.objectContaining({ correlationId: 'request-01' })
    }));
  });

  test('TC-AUTH-CTL-01-02 returns the service-provided masked contacts without adding private fields', async () => {
    const { controller, response, req } = setup();

    await controller.getMe(req, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contacts })
    }));
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toMatch(
      /canonicalCiphertext|lookupKey|ownerId/
    );
  });

  test('TC-AUTH-CTL-01-03 omits csrfToken when the session adapter does not resume CSRF', async () => {
    const { controller, response, req } = setup({ resumeCsrf: false });

    await controller.getMe(req, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { user, contacts }
    }));
  });

  test('TC-AUTH-CTL-01-04 omits an empty resumed CSRF token', async () => {
    const { controller, response, req } = setup({ csrfToken: '' });

    await controller.getMe(req, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { user, contacts }
    }));
  });

  test('TC-AUTH-CTL-01-05 rejects an invalid or expired session before reading contacts or CSRF', async () => {
    const { controller, sessionService, accountSettingsService, response, req } = setup();
    sessionService.getCurrentUser.mockResolvedValueOnce(null);

    await expect(controller.getMe(req, response)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED'
    });
    expect(accountSettingsService.listVerifiedContacts).not.toHaveBeenCalled();
    expect(sessionService.resumeCsrf).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-01-06 propagates a verified-contact service failure without responding', async () => {
    const { controller, sessionService, accountSettingsService, response, req } = setup();
    const error = new Error('contact store unavailable');
    accountSettingsService.listVerifiedContacts.mockRejectedValueOnce(error);

    await expect(controller.getMe(req, response)).rejects.toBe(error);
    expect(sessionService.resumeCsrf).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-01-07 propagates a CSRF resume failure without a partial response', async () => {
    const { controller, sessionService, response, req } = setup();
    const error = new Error('session no longer exists');
    sessionService.resumeCsrf.mockRejectedValueOnce(error);

    await expect(controller.getMe(req, response)).rejects.toBe(error);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

describe('AUTH-CTL-07 deleteSessionsCurrent', () => {
  test('TC-AUTH-CTL-07-01 revokes the current session once before success', async () => {
    const { controller, sessionService, response } = createFixture();

    await controller.deleteSessionsCurrent(request, response);

    expect(sessionService.revoke).toHaveBeenCalledTimes(1);
    expect(sessionService.revoke).toHaveBeenCalledWith(request);
    expect(response.clearCookie).toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(204);
  });

  test('TC-AUTH-CTL-07-02 waits for session revocation before responding', async () => {
    const { controller, sessionService, response } = createFixture();
    let resolveRevoke;
    sessionService.revoke.mockReturnValue(new Promise(resolve => {
      resolveRevoke = resolve;
    }));
    const result = controller.deleteSessionsCurrent(request, response);

    await Promise.resolve();
    expect(response.clearCookie).not.toHaveBeenCalled();
    expect(response.sendStatus).not.toHaveBeenCalled();

    resolveRevoke();
    await result;
    expect(response.sendStatus).toHaveBeenCalledWith(204);
  });

  test('TC-AUTH-CTL-07-03 clears the session cookie after revocation succeeds', async () => {
    const { controller, sessionService, response } = createFixture();

    await controller.deleteSessionsCurrent(request, response);

    expect(sessionService.clearCookie).toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-07-04 clears the cookie with the configured options', async () => {
    const { controller, sessionService, response } = createFixture({ secureCookies: false });

    await controller.deleteSessionsCurrent(request, response);

    expect(sessionService.clearCookie).toHaveBeenCalledWith(response, { secure: false });
  });

  test('TC-AUTH-CTL-07-05 returns HTTP 204 without a response body', async () => {
    const { controller, response } = createFixture();

    await controller.deleteSessionsCurrent(request, response);

    expect(response.sendStatus).toHaveBeenCalledWith(204);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-07-06 propagates a rejected session revocation error', async () => {
    const { controller, sessionService, response } = createFixture();
    const dependencyError = new Error('session store unavailable');
    sessionService.revoke.mockRejectedValueOnce(dependencyError);

    await expect(controller.deleteSessionsCurrent(request, response)).rejects.toBe(dependencyError);
    expect(response.clearCookie).not.toHaveBeenCalled();
    expect(response.sendStatus).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-07-07 forwards the original dependency error unchanged', async () => {
    const { controller, sessionService, response } = createFixture();
    const dependencyError = Object.assign(new Error('revoke failed'), {
      code: 'SESSION_REVOKE_FAILED',
      status: 503
    });
    sessionService.revoke.mockRejectedValueOnce(dependencyError);

    await expect(controller.deleteSessionsCurrent(request, response)).rejects.toBe(dependencyError);
  });

  test('TC-AUTH-CTL-07-08 does not clear the cookie when revocation fails', async () => {
    const { controller, sessionService, response } = createFixture();
    sessionService.revoke.mockRejectedValueOnce(new Error('revoke failed'));

    await expect(controller.deleteSessionsCurrent(request, response)).rejects.toThrow('revoke failed');
    expect(sessionService.clearCookie).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-07-09 does not send HTTP 204 when revocation fails', async () => {
    const { controller, sessionService, response } = createFixture();
    sessionService.revoke.mockRejectedValueOnce(new Error('revoke failed'));

    await expect(controller.deleteSessionsCurrent(request, response)).rejects.toThrow();
    expect(response.sendStatus).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-07-10 propagates a synchronous dependency error', async () => {
    const { controller, sessionService, response } = createFixture();
    const dependencyError = new Error('synchronous revoke failure');
    sessionService.revoke.mockImplementationOnce(() => {
      throw dependencyError;
    });

    await expect(controller.deleteSessionsCurrent(request, response)).rejects.toBe(dependencyError);
    expect(response.clearCookie).not.toHaveBeenCalled();
    expect(response.sendStatus).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-07-11 preserves dependency error identity and properties', async () => {
    const { controller, sessionService, response } = createFixture();
    const dependencyError = Object.assign(new Error('preserve me'), {
      reason: 'database timeout',
      retryable: true
    });
    sessionService.revoke.mockRejectedValueOnce(dependencyError);

    await expect(controller.deleteSessionsCurrent(request, response)).rejects.toBe(dependencyError);
    expect(dependencyError).toMatchObject({
      message: 'preserve me',
      reason: 'database timeout',
      retryable: true
    });
  });

  test('TC-AUTH-CTL-07-12 invokes no unrelated dependency ports', async () => {
    const { controller, sessionService, accountSettingsService, otpService, response } = createFixture();

    await controller.deleteSessionsCurrent(request, response);

    expect(sessionService.revoke).toHaveBeenCalledTimes(1);
    expect(sessionService.clearCookie).toHaveBeenCalledTimes(1);
    expect(accountSettingsService.listVerifiedContacts).not.toHaveBeenCalled();
    expect(otpService.begin).not.toHaveBeenCalled();
    expect(otpService.verify).not.toHaveBeenCalled();
  });
});

describe('AUTH-CTL-02 createOtpChallenges', () => {
  const emailRegister = {
    channel: 'EMAIL',
    contact: 'new-customer@example.test',
    purpose: 'REGISTER'
  };
  const challenge = {
    challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expiresInSeconds: 300,
    resendAfterSeconds: 60
  };

  function setup(body = emailRegister) {
    const { controller, otpService, response } = createFixture();
    const req = { requestId: 'request-02', body };
    otpService.begin.mockResolvedValue(challenge);
    return { controller, otpService, response, req };
  }

  async function expectValidationError(body) {
    const { controller, otpService, response, req } = setup(body);

    await expect(controller.createOtpChallenges(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.begin).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  }

  test('TC-AUTH-CTL-02-01 creates an EMAIL registration OTP challenge', async () => {
    const { controller, otpService, response, req } = setup();

    await controller.createOtpChallenges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(emailRegister);
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: challenge
    }));
  });

  test('TC-AUTH-CTL-02-02 creates an EMAIL login OTP challenge', async () => {
    const emailLogin = { ...emailRegister, purpose: 'LOGIN' };
    const { controller, otpService, response, req } = setup(emailLogin);

    await controller.createOtpChallenges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(emailLogin);
    expect(response.status).toHaveBeenCalledWith(202);
  });

  test('TC-AUTH-CTL-02-03 forwards PHONE login to OTP challenge verification', async () => {
    const phoneLogin = {
      channel: 'PHONE',
      contact: '+84912345678',
      purpose: 'LOGIN'
    };
    const { controller, otpService, response, req } = setup(phoneLogin);

    await controller.createOtpChallenges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(phoneLogin);
    expect(response.status).toHaveBeenCalledWith(202);
  });

  test('TC-AUTH-CTL-02-04 rejects PHONE registration when SMS registration is unavailable', async () => {
    const phoneRegister = {
      channel: 'PHONE',
      contact: '+84912345678',
      purpose: 'REGISTER'
    };
    const { controller, otpService, response, req } = setup(phoneRegister);

    await expect(controller.createOtpChallenges(req, response)).rejects.toMatchObject({
      status: 503,
      code: 'SMS_UNAVAILABLE'
    });
    expect(otpService.begin).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-02-05 rejects a missing request body', async () => {
    await expectValidationError(null);
  });

  test('TC-AUTH-CTL-02-06 rejects an array request body', async () => {
    await expectValidationError([]);
  });

  test('TC-AUTH-CTL-02-07 rejects a primitive request body', async () => {
    await expectValidationError('invalid');
  });

  test('TC-AUTH-CTL-02-08 rejects a request with an unknown field', async () => {
    await expectValidationError({ ...emailRegister, password: 'forbidden' });
  });

  test('TC-AUTH-CTL-02-09 rejects a request missing channel', async () => {
    await expectValidationError({ contact: emailRegister.contact, purpose: emailRegister.purpose });
  });

  test('TC-AUTH-CTL-02-10 rejects a request missing contact', async () => {
    await expectValidationError({ channel: emailRegister.channel, purpose: emailRegister.purpose });
  });

  test('TC-AUTH-CTL-02-11 rejects a request missing purpose', async () => {
    await expectValidationError({ channel: emailRegister.channel, contact: emailRegister.contact });
  });

  test('TC-AUTH-CTL-02-12 propagates an OTP provider failure unchanged', async () => {
    const { controller, otpService, response, req } = setup();
    const dependencyError = Object.assign(new Error('OTP provider unavailable'), {
      status: 503,
      code: 'PROVIDER_UNAVAILABLE'
    });
    otpService.begin.mockRejectedValueOnce(dependencyError);

    await expect(controller.createOtpChallenges(req, response)).rejects.toBe(dependencyError);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

describe('AUTH-CTL-03 createOtpVerifications', () => {
  const registrationVerification = {
    challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    channel: 'EMAIL',
    contact: 'new-customer@example.test',
    purpose: 'REGISTER',
    code: '123456',
    displayName: '  Nguyễn   Văn A  ',
    policyVersions: { terms: 'terms-v1', privacy: 'privacy-v1' }
  };

  const session = {
    user: { id: 'customer-1', roles: ['CUSTOMER'] },
    csrfToken: 'csrf-token',
    expiresAt: '2026-11-10T12:00:00.000Z'
  };

  function setup(body = registrationVerification, options = {}) {
    const { controller, otpService, sessionService, response } = createFixture(options);
    const req = { requestId: 'request-03', body };
    return { controller, otpService, sessionService, response, req };
  }

  async function expectValidationError(body) {
    const { controller, otpService, response, req } = setup(body);

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  }

  test('TC-AUTH-CTL-03-01 verifies a valid email registration OTP and creates a session', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await controller.createOtpVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({
      ...registrationVerification,
      displayName: 'Nguyễn Văn A'
    });
    expect(sessionService.setCookie).toHaveBeenCalledWith(response, session, {
      secure: true,
      persistent: false
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test('TC-AUTH-CTL-03-02 returns the registration session DTO with ISO expiry', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await controller.createOtpVerifications(req, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        verified: true,
        authenticated: true,
        user: session.user,
        csrfToken: session.csrfToken,
        expiresAt: '2026-11-10T12:00:00.000Z'
      }
    }));
  });

  test('TC-AUTH-CTL-03-03 uses the configured cookie security option', async () => {
    const { controller, otpService, sessionService, response, req } = setup(
      registrationVerification,
      { secureCookies: false }
    );
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await controller.createOtpVerifications(req, response);

    expect(sessionService.setCookie).toHaveBeenCalledWith(response, session, {
      secure: false,
      persistent: false
    });
  });

  test('TC-AUTH-CTL-03-04 rejects PHONE registration because SMS registration is unavailable', async () => {
    const phoneRegistration = {
      ...registrationVerification,
      channel: 'PHONE',
      contact: '+84912345678'
    };
    const { controller, otpService, response, req } = setup(phoneRegistration);

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 503,
      code: 'SMS_UNAVAILABLE'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-05 rejects a missing request body', async () => {
    await expectValidationError(null);
  });

  test('TC-AUTH-CTL-03-06 rejects an array request body', async () => {
    await expectValidationError([]);
  });

  test('TC-AUTH-CTL-03-07 rejects unknown request fields', async () => {
    await expectValidationError({ ...registrationVerification, password: 'forbidden' });
  });

  test('TC-AUTH-CTL-03-08 rejects a missing policyVersions field', async () => {
    const body = { ...registrationVerification };
    delete body.policyVersions;
    await expectValidationError(body);
  });

  test('TC-AUTH-CTL-03-09 rejects a non-REGISTER purpose', async () => {
    await expectValidationError({ ...registrationVerification, purpose: 'LOGIN' });
  });

  test('TC-AUTH-CTL-03-10 rejects a blank display name before OTP verification', async () => {
    const { controller, otpService, response, req } = setup({
      ...registrationVerification,
      displayName: '   '
    });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-11 rejects a display name containing a control character', async () => {
    const { controller, otpService, response, req } = setup({
      ...registrationVerification,
      displayName: 'Nguyễn\u0000Văn A'
    });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-12 fails closed when OTP verification is not VERIFIED', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'PENDING', authenticated: false });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 503,
      code: 'REGISTRATION_UNAVAILABLE'
    });
    expect(sessionService.setCookie).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-13 fails closed when OTP is VERIFIED but unauthenticated', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: false });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 503,
      code: 'REGISTRATION_UNAVAILABLE'
    });
    expect(sessionService.setCookie).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-14 fails closed when verified OTP has no session', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 503,
      code: 'REGISTRATION_UNAVAILABLE'
    });
    expect(sessionService.setCookie).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-15 propagates OTP dependency failures unchanged', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    const dependencyError = Object.assign(new Error('OTP provider unavailable'), {
      status: 503,
      code: 'PROVIDER_UNAVAILABLE'
    });
    otpService.verify.mockRejectedValueOnce(dependencyError);

    await expect(controller.createOtpVerifications(req, response)).rejects.toBe(dependencyError);
    expect(sessionService.setCookie).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-16 accepts the SRS lower boundary of two characters', async () => {
    const { controller, otpService, response, req } = setup({
      ...registrationVerification,
      displayName: 'An'
    });
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await controller.createOtpVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({
      ...registrationVerification,
      displayName: 'An'
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test('TC-AUTH-CTL-03-17 accepts the SRS upper boundary of 50 characters', async () => {
    const displayName = 'A'.repeat(50);
    const { controller, otpService, response, req } = setup({
      ...registrationVerification,
      displayName
    });
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await controller.createOtpVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({
      ...registrationVerification,
      displayName
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  test('TC-AUTH-CTL-03-18 rejects a one-character display name below the SRS lower boundary', async () => {
    const { controller, otpService, response, req } = setup({
      ...registrationVerification,
      displayName: 'A'
    });
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-03-19 rejects a 51-character display name above the SRS upper boundary', async () => {
    const { controller, otpService, response, req } = setup({
      ...registrationVerification,
      displayName: 'A'.repeat(51)
    });
    otpService.verify.mockResolvedValue({ status: 'VERIFIED', authenticated: true, session });

    await expect(controller.createOtpVerifications(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });
});

describe('AUTH-CTL-04 createSessions', () => {
  const loginVerification = {
    challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    channel: 'EMAIL',
    contact: 'customer@example.test',
    purpose: 'LOGIN',
    code: '123456'
  };

  const session = {
    user: { id: 'customer-1', roles: ['CUSTOMER'] },
    csrfToken: 'csrf-token',
    expiresAt: '2026-11-10T12:00:00.000Z'
  };

  function setup(body = loginVerification, options = {}) {
    const { controller, otpService, sessionService, response } = createFixture(options);
    const req = { requestId: 'request-04', body };
    return { controller, otpService, sessionService, response, req };
  }

  async function expectValidationError(body) {
    const { controller, otpService, response, req } = setup(body);

    await expect(controller.createSessions(req, response)).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  }

  test('TC-AUTH-CTL-04-01 creates a non-persistent session for valid email OTP', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    otpService.verify.mockResolvedValue({ authenticated: true, session });

    await controller.createSessions(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({ ...loginVerification, rememberDevice: false });
    expect(sessionService.setCookie).toHaveBeenCalledWith(response, session, {
      secure: true,
      persistent: false
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authenticated: true, csrfToken: session.csrfToken })
    }));
  });

  test('TC-AUTH-CTL-04-02 passes rememberDevice true and persistent cookie options', async () => {
    const { controller, otpService, sessionService, response, req } = setup({
      ...loginVerification,
      rememberDevice: true
    });
    otpService.verify.mockResolvedValue({ authenticated: true, session });

    await controller.createSessions(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({ ...loginVerification, rememberDevice: true });
    expect(sessionService.setCookie).toHaveBeenCalledWith(response, session, {
      secure: true,
      persistent: true
    });
  });

  test('TC-AUTH-CTL-04-03 uses configured insecure cookie option', async () => {
    const { controller, otpService, sessionService, response, req } = setup(loginVerification, {
      secureCookies: false
    });
    otpService.verify.mockResolvedValue({ authenticated: true, session });

    await controller.createSessions(req, response);

    expect(sessionService.setCookie).toHaveBeenCalledWith(response, session, {
      secure: false,
      persistent: false
    });
  });

  test('TC-AUTH-CTL-04-04 returns unauthenticated when OTP is valid but account is not registered', async () => {
    const { controller, otpService, sessionService, response, req } = setup();
    otpService.verify.mockResolvedValue({
      authenticated: false,
      reason: 'REGISTRATION_REQUIRED'
    });

    await controller.createSessions(req, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { authenticated: false, reason: 'REGISTRATION_REQUIRED' }
    }));
    expect(sessionService.setCookie).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-04-05 omits non-contract reason for other unauthenticated results', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ authenticated: false, reason: 'OTP_INVALID' });

    await controller.createSessions(req, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { authenticated: false }
    }));
  });

  test('TC-AUTH-CTL-04-06 rejects a missing body', async () => {
    await expectValidationError(null);
  });

  test('TC-AUTH-CTL-04-07 rejects an array body', async () => {
    await expectValidationError([]);
  });

  test('TC-AUTH-CTL-04-08 rejects a primitive body', async () => {
    await expectValidationError('invalid');
  });

  test('TC-AUTH-CTL-04-09 rejects an extra request field', async () => {
    await expectValidationError({ ...loginVerification, actor: request.auth });
  });

  test('TC-AUTH-CTL-04-10 rejects a missing OTP code', async () => {
    const body = { ...loginVerification };
    delete body.code;
    await expectValidationError(body);
  });

  test('TC-AUTH-CTL-04-11 rejects a non-LOGIN purpose', async () => {
    await expectValidationError({ ...loginVerification, purpose: 'REGISTER' });
  });

  test('TC-AUTH-CTL-04-12 rejects a non-boolean rememberDevice value', async () => {
    await expectValidationError({ ...loginVerification, rememberDevice: null });
  });

  test('TC-AUTH-CTL-04-13 forwards PHONE login to OTP verification', async () => {
    const phoneLogin = {
      ...loginVerification,
      channel: 'PHONE',
      contact: '+84912345678'
    };
    const { controller, otpService, response, req } = setup(phoneLogin);
    const dependencyError = Object.assign(new Error('SMS delivery is unavailable'), {
      status: 503,
      code: 'SMS_UNAVAILABLE'
    });
    otpService.verify.mockRejectedValueOnce(dependencyError);

    await expect(controller.createSessions(req, response)).rejects.toBe(dependencyError);
    expect(otpService.verify).toHaveBeenCalledWith({ ...phoneLogin, rememberDevice: false });
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-04-14 forwards OTP dependency errors unchanged', async () => {
    const { controller, otpService, response, req } = setup();
    const dependencyError = Object.assign(new Error('OTP unavailable'), {
      status: 503,
      code: 'PROVIDER_UNAVAILABLE'
    });
    otpService.verify.mockRejectedValueOnce(dependencyError);

    await expect(controller.createSessions(req, response)).rejects.toBe(dependencyError);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-04-15 returns the session expiry as an ISO timestamp', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ authenticated: true, session });

    await controller.createSessions(req, response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ expiresAt: session.expiresAt })
    }));
  });
});

describe('AUTH-CTL-05 createMeContactChanges', () => {
  const emailBody = { channel: 'EMAIL', contact: 'new@example.test' };
  const phoneBody = { channel: 'PHONE', contact: '+84912345678' };
  const challenge = {
    challengeId: 'challenge-05',
    expiresInSeconds: 300,
    resendAfterSeconds: 60
  };

  function setup(body, auth = request.auth, requestId = 'request-05') {
    const { controller, otpService, response } = createFixture();
    const req = { auth, requestId, body };
    otpService.begin.mockResolvedValue(challenge);
    return { controller, otpService, response, req };
  }

  async function expectValidationError(controller, otpService, response, req) {
    await expect(
      controller.createMeContactChanges(req, response)
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    expect(otpService.begin).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  }

  test('TC01 calls OTP service for a valid email contact', async () => {
    const { controller, otpService, response, req } = setup(emailBody);

    await controller.createMeContactChanges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(expect.objectContaining(emailBody));
  });

  test('TC02 calls OTP service for a valid phone contact', async () => {
    const { controller, otpService, response, req } = setup(phoneBody);

    await controller.createMeContactChanges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(expect.objectContaining(phoneBody));
  });

  test('TC03 rejects a request with missing channel', async () => {
    const { controller, otpService, response, req } = setup({ contact: emailBody.contact });

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC04 rejects a request with missing contact', async () => {
    const { controller, otpService, response, req } = setup({ channel: emailBody.channel });

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC05 rejects an unsupported channel', async () => {
    const { controller, otpService, response, req } = setup({
      channel: 'FAX',
      contact: 'new@example.test'
    });

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC06 rejects an empty contact', async () => {
    const { controller, otpService, response, req } = setup({
      channel: 'EMAIL',
      contact: ''
    });

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC07 rejects a null request body safely', async () => {
    const { controller, otpService, response, req } = setup(null);

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC08 rejects an array or primitive request body', async () => {
    for (const body of [[], ['EMAIL', 'new@example.test'], 'invalid']) {
      const { controller, otpService, response, req } = setup(body);

      await expectValidationError(controller, otpService, response, req);
    }
  });

  test('TC09 passes the authenticated actor to OTP service', async () => {
    const { controller, otpService, response, req } = setup(emailBody);

    await controller.createMeContactChanges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(expect.objectContaining({ actor: req.auth }));
  });

  test('TC10 passes CONTACT_CHANGE as the OTP purpose', async () => {
    const { controller, otpService, response, req } = setup(emailBody);

    await controller.createMeContactChanges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'CONTACT_CHANGE'
    }));
  });

  test('TC11 passes the exact contact and channel to OTP service', async () => {
    const { controller, otpService, response, req } = setup(emailBody);

    await controller.createMeContactChanges(req, response);

    expect(otpService.begin).toHaveBeenCalledWith(expect.objectContaining(emailBody));
  });

  test('TC12 calls OTP service exactly once', async () => {
    const { controller, otpService, response, req } = setup(emailBody);

    await controller.createMeContactChanges(req, response);

    expect(otpService.begin).toHaveBeenCalledTimes(1);
  });

  test('TC13 rejects a request when actor userId is missing', async () => {
    const { controller, otpService, response, req } = setup(emailBody, {
      ...request.auth,
      userId: undefined
    });

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC14 rejects a request when actor sessionId is missing', async () => {
    const { controller, otpService, response, req } = setup(emailBody, {
      ...request.auth,
      sessionId: undefined
    });

    await expectValidationError(controller, otpService, response, req);
  });

  test('TC15 forwards a business error from OTP service', async () => {
    const { controller, otpService, response, req } = setup(emailBody);
    const error = Object.assign(new Error('contact already linked'), {
      status: 409,
      code: 'CONTACT_ALREADY_LINKED'
    });
    otpService.begin.mockRejectedValueOnce(error);

    await expect(controller.createMeContactChanges(req, response)).rejects.toBe(error);
  });

  test('TC16 forwards a provider error from OTP service', async () => {
    const { controller, otpService, response, req } = setup(emailBody);
    const error = Object.assign(new Error('provider unavailable'), {
      status: 503,
      code: 'SMS_UNAVAILABLE'
    });
    otpService.begin.mockRejectedValueOnce(error);

    await expect(controller.createMeContactChanges(req, response)).rejects.toBe(error);
  });

  test('TC17 forwards an unexpected error from OTP service', async () => {
    const { controller, otpService, response, req } = setup(emailBody);
    const error = new Error('unexpected failure');
    otpService.begin.mockRejectedValueOnce(error);

    await expect(controller.createMeContactChanges(req, response)).rejects.toBe(error);
  });

  test('TC18 returns HTTP 202 and the API challenge body', async () => {
    const { controller, otpService, response, req } = setup(emailBody, request.auth, 'request-18');

    await controller.createMeContactChanges(req, response);

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: challenge,
      meta: expect.objectContaining({ correlationId: 'request-18' })
    }));
    expect(otpService.begin).toHaveBeenCalledTimes(1);
  });

  test('TC19 handles a challenge with a missing required field', async () => {
    const { controller, otpService, response, req } = setup(emailBody);
    otpService.begin.mockResolvedValueOnce({
      challengeId: challenge.challengeId,
      expiresInSeconds: challenge.expiresInSeconds
    });

    await controller.createMeContactChanges(req, response);

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        challengeId: challenge.challengeId,
        expiresInSeconds: challenge.expiresInSeconds,
        resendAfterSeconds: undefined
      }
    }));
  });

  test('TC20 returns all challenge information for a complete challenge', async () => {
    const { controller, response, req } = setup(emailBody);

    await controller.createMeContactChanges(req, response);

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: challenge
    }));
  });
});

describe('AUTH-CTL-06 createMeContactVerifications', () => {
  const verification = {
    challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    channel: 'EMAIL',
    contact: 'new@example.test',
    purpose: 'CONTACT_CHANGE',
    code: '123456'
  };

  function setup(body = verification, auth = request.auth, requestId = 'request-06') {
    const { controller, otpService, response } = createFixture();
    const req = { auth, requestId, body };
    return { controller, otpService, response, req };
  }

  async function expectValidationError(body) {
    const { controller, otpService, response, req } = setup(body);

    await expect(
      controller.createMeContactVerifications(req, response)
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED'
    });

    expect(otpService.verify).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  }

  test('TC-AUTH-CTL-06-01 verifies a valid contact challenge successfully', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({ ...verification, actor: req.auth });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { verified: true },
      meta: expect.objectContaining({ correlationId: req.requestId })
    }));
  });

  test('TC-AUTH-CTL-06-02 verifies an email change successfully', async () => {
    const { controller, otpService, response, req } = setup({
      ...verification,
      channel: 'EMAIL',
      contact: 'changed@example.test'
    });
    otpService.verify.mockResolvedValue({ status: 'VERIFIED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({ ...req.body, actor: req.auth });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { verified: true }
    }));
  });

  test('TC-AUTH-CTL-06-03 verifies a phone number change successfully', async () => {
    const { controller, otpService, response, req } = setup({
      ...verification,
      channel: 'PHONE',
      contact: '+84912345678'
    });
    otpService.verify.mockResolvedValue({ status: 'VERIFIED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({ ...req.body, actor: req.auth });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { verified: true }
    }));
  });

  test('TC-AUTH-CTL-06-04 rejects a missing request body', async () => {
    await expectValidationError(null);
  });

  test('TC-AUTH-CTL-06-05 rejects missing verification data', async () => {
    const missingCode = { ...verification };
    delete missingCode.code;
    await expectValidationError(missingCode);
  });

  test('TC-AUTH-CTL-06-06 forwards invalid-format data to the OTP port', async () => {
    const invalidVerification = { ...verification, code: 'not-a-code' };
    const { controller, otpService, response, req } = setup(invalidVerification);
    const error = Object.assign(new Error('OTP format is invalid'), {
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    otpService.verify.mockRejectedValueOnce(error);

    await expect(controller.createMeContactVerifications(req, response)).rejects.toBe(error);
    expect(otpService.verify).toHaveBeenCalledWith({ ...invalidVerification, actor: req.auth });
  });

  test('TC-AUTH-CTL-06-07 passes the authenticated actor, not a client actor', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({ ...verification, actor: req.auth });
  });

  test('TC-AUTH-CTL-06-08 passes CONTACT_CHANGE as the purpose', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify.mock.calls[0][0].purpose).toBe('CONTACT_CHANGE');
  });

  test('TC-AUTH-CTL-06-09 keeps actor and purpose in their contract fields', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'VERIFIED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledWith({
      ...verification,
      actor: req.auth,
      purpose: 'CONTACT_CHANGE'
    });
  });

  test.each([
    ['TC-AUTH-CTL-06-10 incorrect OTP code', 'OTP_INVALID'],
    ['TC-AUTH-CTL-06-11 expired OTP code', 'OTP_EXPIRED'],
    ['TC-AUTH-CTL-06-12 already used OTP code', 'OTP_ALREADY_USED'],
    ['TC-AUTH-CTL-06-13 verification challenge not found', 'CHALLENGE_NOT_FOUND'],
    ['TC-AUTH-CTL-06-14 actor mismatch', 'ACTOR_MISMATCH'],
    ['TC-AUTH-CTL-06-15 purpose mismatch', 'PURPOSE_MISMATCH']
  ])('%s forwards the OTP error unchanged', async (_name, code) => {
    const { controller, otpService, response, req } = setup();
    const error = Object.assign(new Error(code), { status: 422, code });
    otpService.verify.mockRejectedValueOnce(error);

    await expect(controller.createMeContactVerifications(req, response)).rejects.toBe(error);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  test('TC-AUTH-CTL-06-16 forwards a synchronous OTP port error', async () => {
    const { controller, otpService, response, req } = setup();
    const error = new Error('OTP port failed');
    otpService.verify.mockImplementationOnce(() => {
      throw error;
    });

    await expect(controller.createMeContactVerifications(req, response)).rejects.toBe(error);
  });

  test('TC-AUTH-CTL-06-17 forwards an asynchronous OTP port rejection', async () => {
    const { controller, otpService, response, req } = setup();
    const error = new Error('OTP port rejected');
    otpService.verify.mockRejectedValueOnce(error);

    await expect(controller.createMeContactVerifications(req, response)).rejects.toBe(error);
  });

  test('TC-AUTH-CTL-06-18 calls the OTP port exactly once', async () => {
    const { controller, otpService, response, req } = setup();
    otpService.verify.mockResolvedValue({ status: 'REJECTED' });

    await controller.createMeContactVerifications(req, response);

    expect(otpService.verify).toHaveBeenCalledTimes(1);
  });
});
