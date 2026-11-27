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
  return { verifyAndReadStatus: createApplicationStatusService({ applications, statusOtp, clock: () => now }).verifyAndReadStatus,
    applications, statusOtp };
}

// SRS: SRS IV Security: Application documents; GBR-02; UC-16/18.
test("APP-STATUS-02-UTCID01 [A] Chưa có proof hợp lệ không đọc application riêng tư", async () => {
  const f = fixture({ verified: false });
  await expect(f.verifyAndReadStatus({ applicationCode: CODE, challengeId: CHALLENGE, code: '123456' }))
    .rejects.toMatchObject({ status: 401, code: 'APPLICATION_STATUS_VERIFICATION_FAILED' });
  expect(f.applications.findApplicantStatusById).not.toHaveBeenCalled();
});

// SRS: SRS IV Security: Application documents; GBR-02; UC-16/18.
test("APP-STATUS-02-UTCID02 [N] Trả Pending với projection không chứa giấy tờ", async () => {
  const f = fixture({ state: 'PENDING' });
  const actual = await f.verifyAndReadStatus({ applicationCode: CODE, challengeId: CHALLENGE, code: '123456' });
  expect(actual.state).toBe('PENDING');
  expect(actual).not.toHaveProperty('privateDocuments');
  expect(actual).not.toHaveProperty('identityNumber');
  expect(actual).not.toHaveProperty('contact');
  expect(actual).not.toHaveProperty('provisionedUserId');
  expect(f.applications.findApplicantStatusById).toHaveBeenCalledWith({ applicationId: 'scoped-application-id' });
});

// SRS: SRS IV Security: Application documents; GBR-02; UC-16/18.
test("APP-STATUS-02-UTCID03 [N] Trả Approved không lộ tài khoản hoặc giấy tờ", async () => {
  const f = fixture({ state: 'APPROVED' });
  const actual = await f.verifyAndReadStatus({ applicationCode: CODE, challengeId: CHALLENGE, code: '123456' });
  expect(actual.state).toBe('APPROVED');
  expect(actual).not.toHaveProperty('privateDocuments');
  expect(actual).not.toHaveProperty('identityNumber');
  expect(actual).not.toHaveProperty('contact');
  expect(actual).not.toHaveProperty('provisionedUserId');
  expect(f.applications.findApplicantStatusById).toHaveBeenCalledWith({ applicationId: 'scoped-application-id' });
});

// SRS: UC-18; GBR-25; SRS IV Security Application documents.
test("APP-STATUS-02-UTCID04 [B] Trước đủ 30 ngày một ms chưa được nộp lại", async () => {
  const f = fixture({ state: 'REJECTED', now: REJECTED + 30 * 86400000 + (-1) });
  const actual = await f.verifyAndReadStatus({ applicationCode: CODE, challengeId: CHALLENGE, code: '123456' });
  expect(actual.canReapply).toBe(false);
  expect(actual.reapplyEligibleAt).toBe(new Date(REJECTED + 30 * 86400000).toISOString());
  expect(actual.rejectionReason).toBe('Not enough experience');
});

// SRS: UC-18; GBR-25; SRS IV Security Application documents.
test("APP-STATUS-02-UTCID05 [B] Đúng đủ 30 ngày được nộp lại", async () => {
  const f = fixture({ state: 'REJECTED', now: REJECTED + 30 * 86400000 + (0) });
  const actual = await f.verifyAndReadStatus({ applicationCode: CODE, challengeId: CHALLENGE, code: '123456' });
  expect(actual.canReapply).toBe(true);
  expect(actual.reapplyEligibleAt).toBe(new Date(REJECTED + 30 * 86400000).toISOString());
  expect(actual.rejectionReason).toBe('Not enough experience');
});
