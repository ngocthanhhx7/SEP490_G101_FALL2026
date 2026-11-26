// CARE-NOTE-02 — chỉ kiểm thử readInstructions; mỗi UTCID là một test riêng.
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

// SRS: UC-36; UC-40; UC-41 bước 2; SRS III.13.1.1, dòng 5036–5055; GBR-02.
test("CARE-NOTE-02-UTCID01 [N] Customer đọc đúng phiên bản đã xác nhận", async () => {
  const f = fixture();
  const actual = await f.service.getInstructions(f.input);
  expect(actual).toMatchObject({ version: 1, instructions: { feeding: 'Cho ăn theo hồ sơ' } });
});

// SRS: UC-36; UC-37; SRS III.13.1.1 Home access note, dòng 5054–5055
test("CARE-NOTE-02-UTCID02 [N] Sitter được phân công đọc hướng dẫn nhưng chưa thấy ghi chú cửa sớm", async () => {
  const f = fixture(); f.input.actor = actor(SITTER, 'PET_SITTER');
  const actual = await f.service.getInstructions(f.input);
  expect(actual.instructions.feeding).toBe('Cho ăn theo hồ sơ');
  expect(actual.instructions).not.toHaveProperty('accessNotes');
});

// SRS: UC-36; UC-40; UC-41 bước 2; SRS III.13.1.1, dòng 5036–5055; GBR-02.
test("CARE-NOTE-02-UTCID03 [A] Customer khác không đọc được hướng dẫn", async () => {
  const f = fixture(); f.input.actor = actor('other-customer', 'CUSTOMER');
  await expect(f.service.getInstructions(f.input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});

// SRS: UC-41 Preconditions và Normal Flow 1–3, dòng 2817–2823; III.13.2.1, dòng 5078–5085
test("CARE-NOTE-02-UTCID04 [N] Sitter thay thế phải đọc được hướng dẫn trước khi xác nhận bàn giao", async () => {
  const f = fixture(); f.input.actor = actor(SITTER, 'PET_SITTER');
  f.state.visit.handoverRequired = true; f.state.visit.handoverAccepted = false;
  const actual = await f.service.getInstructions(f.input);
  expect(actual.instructions.feeding).toBe('Cho ăn theo hồ sơ');
});
