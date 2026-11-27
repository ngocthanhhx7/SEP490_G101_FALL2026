// CARE-NOTE-03 — chỉ kiểm thử updateInstructions; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createCareInstructionsService } from '../../../src/services/care/care-instructions.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z');
const OWNER = 'customer-1', SITTER = 'sitter-1', VISIT = 'visit-1';
const actor = (userId, role) => ({ userId, roles: [role], state: 'ACTIVE', expiresAt: NOW + 86400000 });
function fixture(lead = 4 * 3600000) {
  const state = { visit: { id: VISIT, customerId: OWNER, sitterId: SITTER, state: 'ASSIGNED', version: 1,
    startAt: new Date(NOW + lead), endAt: new Date(NOW + lead + 3600000), handoverRequired: false },
    care: { version: 1, instructions: { feeding: 'Cho ăn theo hồ sơ', allergies: 'Không ăn cá', accessNotes: 'Cổng bên hông' },
      acknowledgements: [{ sitterId: SITTER, version: 1 }], requiresAcknowledgement: false }, history: [] };
  const tx = {
    getVisit: jest.fn(async () => state.visit), getCareInstructions: jest.fn(async () => state.care),
    listCareInstructionHistory: jest.fn(async () => state.history), getOfferForSitter: jest.fn(async () => null),
    saveCareInstructions: jest.fn(async record => { state.history.push(globalThis.structuredClone(state.care)); state.care = { ...record, acknowledgements: [] }; return { ...record, visitId: VISIT }; }),
    recordCareInstructionAcknowledgement: jest.fn(async record => { state.care.acknowledgements.push(record); return { ...record, acknowledged: true }; }),
    getAccessNotesSnapshot: jest.fn(async () => ({ privateAccessNotes: 'Ghi chú cửa tổng hợp' })),
    appendAuditAndOutbox: jest.fn(async () => {})
  };
  const repository = { runForVisitActor: jest.fn(async (_actor, _id, work) => work(tx)) };
  const service = createCareInstructionsService({ repository, clock: () => NOW });
  const input = { actor: actor(OWNER, 'CUSTOMER'), visitId: VISIT, expectedVersion: 1,
    idempotencyKey: 'synthetic-care-key', instructions: { feeding: 'Khẩu phần mới', allergies: 'Không ăn cá' } };
  return { service, input, state, tx };
}

// SRS: UC-40; GBR-23, dòng 6590–6594; SRS III.13.1.1, dòng 5036–5059.
test("CARE-NOTE-03-UTCID01 [N] Lưu phiên bản mới và yêu cầu Sitter đọc lại", async () => {
  const f = fixture();
  const actual = await f.service.updateInstructions(f.input);
  expect(actual.version).toBe(2); expect(actual.instructions.feeding).toBe('Khẩu phần mới');
  expect(f.state.history[0].version).toBe(1);
  expect(f.tx.appendAuditAndOutbox).toHaveBeenCalledWith(expect.objectContaining({ type: 'CareInstructionsVersioned', requiresAcknowledgement: true }));
});

// SRS: UC-40; GBR-23, dòng 6590–6594; SRS III.13.1.1, dòng 5036–5059.
test("CARE-NOTE-03-UTCID02 [B] Đúng 2 giờ trước buổi vẫn sửa được", async () => {
  const f = fixture(2 * 3600000);
  await expect(f.service.updateInstructions(f.input)).resolves.toMatchObject({ version: 2 });
});

// SRS: UC-40; GBR-23, dòng 6590–6594; SRS III.13.1.1, dòng 5036–5059.
test("CARE-NOTE-03-UTCID03 [B] Dưới 2 giờ không thay snapshot của buổi hiện tại", async () => {
  const f = fixture(2 * 3600000 - 1);
  await f.service.updateInstructions(f.input).catch(() => undefined);
  expect(f.tx.saveCareInstructions).not.toHaveBeenCalled(); expect(f.state.care.version).toBe(1);
});

// SRS: UC-40 actor Customer; Permission Matrix; GBR-02
test("CARE-NOTE-03-UTCID04 [A] Sitter không được sửa hướng dẫn của Customer", async () => {
  const f = fixture(); f.input.actor = actor(SITTER, 'PET_SITTER');
  await expect(f.service.updateInstructions(f.input)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  expect(f.tx.saveCareInstructions).not.toHaveBeenCalled();
});
