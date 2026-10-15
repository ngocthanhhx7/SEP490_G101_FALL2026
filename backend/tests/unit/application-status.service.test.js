import { describe, expect, jest, test } from '@jest/globals';
import { createApplicationStatusService } from '../../src/services/applications/application-status.service.js';

const APPLICATION_CODE = '1234567890123456789012';
const CHALLENGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REJECTED_AT = new Date('2026-10-01T12:00:00.000Z');
const APPLICATION_ID = 'app-internal-1';

function createService({ record = {}, verified = true, clock = () => Date.parse('2026-10-31T11:59:59.999Z') } = {}) {
  const applications = { findApplicantStatusById: jest.fn().mockResolvedValue({
    state: 'REJECTED', submittedAt: '2026-09-29T12:00:00.000Z',
    rejectedAt: REJECTED_AT, reapplyAt: new Date(REJECTED_AT.getTime() + 30 * 24 * 60 * 60 * 1000),
    decisionReason: 'Please add the required care experience.',
    privateDocuments: [{ storageRef: 'private-ref' }], contact: 'applicant@example.test',
    applicationCode: 'must-not-be-returned', provisionedUserId: 'must-not-be-returned', ...record
  }) };
  const statusOtp = {
    beginForApplication: jest.fn().mockResolvedValue({ challengeId: CHALLENGE_ID, expiresInSeconds: 300, resendAfterSeconds: 60 }),
    verifyForApplication: jest.fn().mockResolvedValue(verified ? { verified: true, applicationId: APPLICATION_ID } : { verified: false })
  };
  return { service: createApplicationStatusService({ applications, statusOtp, clock }), applications, statusOtp };
}

describe('application status service', () => {
  test('requests a challenge without echoing the application code or contact', async () => {
    const { service, statusOtp } = createService();
    await expect(service.requestVerification({ applicationCode: APPLICATION_CODE })).resolves.toEqual({
      status: 'PENDING', challengeId: CHALLENGE_ID, expiresInSeconds: 300, resendAfterSeconds: 60
    });
    expect(statusOtp.beginForApplication).toHaveBeenCalledWith({
      applicationCode: APPLICATION_CODE, purpose: 'APPLICATION_STATUS'
    });
  });

  test('rejects malformed codes and extra identifiers before calling OTP', async () => {
    const { service, statusOtp } = createService();
    await expect(service.requestVerification({ applicationCode: 'short' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID,
      code: '123456', applicationId: APPLICATION_ID })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(statusOtp.beginForApplication).not.toHaveBeenCalled();
    expect(statusOtp.verifyForApplication).not.toHaveBeenCalled();
  });

  test('returns only the applicant status projection after a verified, application-bound challenge', async () => {
    const { service, applications, statusOtp } = createService();
    const result = await service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' });
    expect(statusOtp.verifyForApplication).toHaveBeenCalledWith({
      applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345', purpose: 'APPLICATION_STATUS'
    });
    expect(applications.findApplicantStatusById).toHaveBeenCalledWith({ applicationId: APPLICATION_ID });
    expect(result).toEqual({
      state: 'REJECTED', submittedAt: '2026-09-29T12:00:00.000Z',
      rejectionReason: 'Please add the required care experience.',
      reapplyEligibleAt: '2026-10-31T12:00:00.000Z', canReapply: false
    });
    expect(JSON.stringify(result)).not.toMatch(/applicationCode|contact|privateDocuments|storageRef|provisionedUserId/);
  });

  test('uses the server clock at the exact 30-day reapplication boundary', async () => {
    const eligibleAt = REJECTED_AT.getTime() + 30 * 24 * 60 * 60 * 1000;
    const { service } = createService({ clock: () => eligibleAt });
    await expect(service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' }))
      .resolves.toMatchObject({ reapplyEligibleAt: '2026-10-31T12:00:00.000Z', canReapply: true });
  });

  test('does not read an application after failed OTP verification', async () => {
    const { service, applications } = createService({ verified: false });
    await expect(service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' }))
      .rejects.toMatchObject({ status: 401, code: 'APPLICATION_STATUS_VERIFICATION_FAILED' });
    expect(applications.findApplicantStatusById).not.toHaveBeenCalled();
  });

  test('normalizes OTP provider failures without exposing internal messages', async () => {
    const { service, statusOtp } = createService();
    statusOtp.verifyForApplication.mockRejectedValue(Object.assign(new Error('private provider detail'), {
      status: 400, code: 'OTP_INVALID_OR_EXPIRED'
    }));
    await expect(service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' }))
      .rejects.toMatchObject({ status: 401, code: 'APPLICATION_STATUS_VERIFICATION_FAILED', message: 'Application status could not be verified' });

    statusOtp.beginForApplication.mockRejectedValue(Object.assign(new Error('private throttle detail'), {
      status: 429, code: 'OTP_RATE_LIMITED', details: { retryAfterSeconds: 7210 }
    }));
    await expect(service.requestVerification({ applicationCode: APPLICATION_CODE }))
      .rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', message: 'Please wait before trying again', details: { retryAfterSeconds: 3600 } });
  });

  test('fails closed for an unsupported state or inconsistent rejection deadline', async () => {
    const unsupported = createService({ record: { state: 'SUSPENDED' } });
    await expect(unsupported.service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' }))
      .rejects.toMatchObject({ status: 503, code: 'APPLICATION_STATUS_UNAVAILABLE' });

    const inconsistent = createService({ record: { reapplyAt: new Date('2026-11-01T12:00:00.000Z') } });
    await expect(inconsistent.service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' }))
      .rejects.toMatchObject({ status: 503, code: 'APPLICATION_STATUS_UNAVAILABLE' });
  });

  test('fails closed when required status dates are null or missing', async () => {
    for (const record of [
      { submittedAt: null },
      { submittedAt: undefined },
      { rejectedAt: null },
      { rejectedAt: undefined }
    ]) {
      const { service } = createService({ record });
      await expect(service.verifyAndReadStatus({ applicationCode: APPLICATION_CODE, challengeId: CHALLENGE_ID, code: '012345' }))
        .rejects.toMatchObject({ status: 503, code: 'APPLICATION_STATUS_UNAVAILABLE' });
    }
  });

  test('requires the scoped OTP and repository ports at composition time', () => {
    expect(() => createApplicationStatusService({ applications: {}, statusOtp: {} })).toThrow(TypeError);
  });
});
