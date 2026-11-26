import { test, expect, jest } from '@jest/globals';
import { createApplicationStatusService } from '../../../src/services/applications/application-status.service.js';
const CODE = 'synthetic_application_code_01';
const CHALLENGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REJECTED = Date.parse('2026-10-17T03:00:00.000Z');
function fixture({ verified = true, state = 'PENDING', now = REJECTED + 30 * 86400000 } = {}) {
  const applications = { findApplicantStatusById: jest.fn(async () => ({ state,
    submittedAt: '2026-10-16T03:00:00.000Z', rejectedAt: new Date(REJECTED),
    reapplyAt: new Date(REJECTED + 30 * 86400000), decisionReason: 'Not enough experience',
    contact: 'synthetic@example.test', privateDocuments: [{ storageRef: 'synthetic-private-ref' }],
    identityNumber: '012345678901', provisionedUserId: 'private-user-id' })) };
  const statusOtp = { beginForApplication: jest.fn(async () => ({ challengeId: CHALLENGE,
    expiresInSeconds: 300, resendAfterSeconds: 60, contact: 'synthetic@example.test',
    privateDocuments: [{ storageRef: 'synthetic-private-ref' }] })),
    verifyForApplication: jest.fn(async () => verified ? { verified: true, applicationId: 'scoped-application-id' } : { verified: false }) };
  return { requestVerification: createApplicationStatusService({ applications, statusOtp, clock: () => now }).requestVerification,
    applications, statusOtp };
}

// SRS: SRS IV Security: Application documents; GBR-02; UC-16/18.
test("APP-STATUS-01-UTCID01 [N] Response yêu cầu xác minh không lộ contact hoặc giấy tờ ứng viên", async () => {
  const f = fixture();
  const actual = await f.requestVerification({ applicationCode: CODE });
  expect(actual.challengeId).toBe(CHALLENGE);
  expect(actual).not.toHaveProperty('contact');
  expect(actual).not.toHaveProperty('privateDocuments');
  expect(JSON.stringify(actual)).not.toContain('synthetic-private-ref');
  expect(f.applications.findApplicantStatusById).not.toHaveBeenCalled();
});
