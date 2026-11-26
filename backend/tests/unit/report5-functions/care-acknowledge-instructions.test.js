// CARE-NOTE-04 — chỉ kiểm thử acknowledgeInstructions; mỗi UTCID là một test riêng.
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

// SRS: GBR-23, dòng 6590–6594; UC-41 Alternative 4.1, dòng 2829–2830.
test("CARE-NOTE-04-UTCID01 [N] Sitter xác nhận đã đọc phiên bản mới nhất", async () => {
  const f = fixture(); f.input.actor = actor(SITTER, 'PET_SITTER');
  f.input.instructionVersion = 1;
  const actual = await f.service.acknowledgeInstructions(f.input);
  expect(actual).toMatchObject({ sitterId: SITTER, version: 1, acknowledged: true });
});

// SRS: GBR-23, dòng 6590–6594; UC-41 Alternative 4.1, dòng 2829–2830.
test("CARE-NOTE-04-UTCID02 [A] Không xác nhận nhầm phiên bản cũ", async () => {
  const f = fixture(); f.input.actor = actor(SITTER, 'PET_SITTER'); f.input.instructionVersion = 0;
  await expect(f.service.acknowledgeInstructions(f.input)).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  expect(f.tx.recordCareInstructionAcknowledgement).not.toHaveBeenCalled();
});

// SRS: GBR-02; GBR-23: Sitter của buổi xác nhận phiên bản
test("CARE-NOTE-04-UTCID03 [A] Sitter không liên quan không được xác nhận thay", async () => {
  const f = fixture(); f.input.actor = actor('other-sitter', 'PET_SITTER'); f.input.instructionVersion = 1;
  await expect(f.service.acknowledgeInstructions(f.input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});
