// HANDOVER-01 — chỉ kiểm thử confirm; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createHandoverService } from '../../../src/services/care/handover.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z'), VISIT = 'visit-1', REPLACEMENT = 'replacement-1';
const actor = (userId, role) => ({ userId, roles: [role], state: 'ACTIVE', expiresAt: NOW + 86400000 });
function fixture() {
  const visit = { id: VISIT, customerId: 'customer-1', sitterId: REPLACEMENT, state: 'ASSIGNED', version: 1,
    handoverRequired: true, startAt: new Date(NOW + 7200000), endAt: new Date(NOW + 10800000) };
  const care = { version: 1, acknowledgements: [{ sitterId: REPLACEMENT, version: 1 }] };
  const tx = { getVisit: async () => visit, getCareInstructions: async () => care, getHandover: async () => null,
    getReplacementAssignment: async () => ({ sitterId: REPLACEMENT, state: 'ASSIGNED' }),
    confirmHandover: jest.fn(async input => ({ visitId: VISIT, state: 'CONFIRMED', replacementSitterId: REPLACEMENT,
      instructionVersion: 1, confirmedAt: input.confirmedAt, accessGranted: true })), appendAuditAndOutbox: jest.fn(async () => {}) };
  const service = createHandoverService({ repository: { runForVisitActor: async (_a, _id, work) => work(tx) }, clock: () => NOW });
  const input = { actor: actor(REPLACEMENT, 'PET_SITTER'), visitId: VISIT, replacementSitterId: REPLACEMENT,
    expectedVersion: 1, instructionVersion: 1, idempotencyKey: 'synthetic-handover-key' };
  return { service, input, visit, care, tx };
}

// SRS: UC-41 Preconditions / Normal Flow 1–5, dòng 2817–2825; III.13.2.1 dòng 5071–5087.
test("HANDOVER-01-UTCID01 [N] Sitter thay thế đã đọc hướng dẫn xác nhận bàn giao", async () => {
  const f = fixture();
  const result = await f.service.confirm(f.input);
  expect(result).toMatchObject({ state: 'CONFIRMED', replacementSitterId: REPLACEMENT });
  expect(result.confirmedAt).toBe(new Date(NOW).toISOString());
});

// SRS: UC-41 Alternative 3.1; III.13.2.1 dòng 5072: vẫn có thể xác nhận khi còn được phân công
test("HANDOVER-01-UTCID02 [B] Quá mốc 1 giờ vẫn xác nhận được khi còn được phân công", async () => {
  const f = fixture(); f.visit.startAt = new Date(NOW + 30 * 60000);
  await expect(f.service.confirm(f.input)).resolves.toMatchObject({ state: 'CONFIRMED' });
});

// SRS: UC-41 Preconditions / Normal Flow 1–5, dòng 2817–2825; III.13.2.1 dòng 5071–5087.
test("HANDOVER-01-UTCID03 [A] Customer không xác nhận đã đọc thay Sitter", async () => {
  const f = fixture(); f.input.actor = actor('customer-1', 'CUSTOMER');
  f.visit.sitterId = 'previous-sitter';
  await expect(f.service.confirm(f.input)).rejects.toBeDefined();
  expect(f.tx.confirmHandover).not.toHaveBeenCalled();
});
