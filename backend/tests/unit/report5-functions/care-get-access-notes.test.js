// CARE-NOTE-05 — chỉ kiểm thử getAccessNotes; mỗi UTCID là một test riêng.
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

// SRS: UC-37; SRS III.13.1.1 Home access note, dòng 5054–5055; UC-41 bước 5, dòng 2825.
test("CARE-NOTE-05-UTCID01 [B] Đúng 1 giờ trước buổi Sitter được xem ghi chú cửa", async () => {
  const f = fixture(3600000); f.input.actor = actor(SITTER, 'PET_SITTER');
  await expect(f.service.getAccessNotes(f.input)).resolves.toMatchObject({ privateAccessNotes: 'Ghi chú cửa tổng hợp' });
});

// SRS: UC-37; SRS III.13.1.1 Home access note, dòng 5054–5055; UC-41 bước 5, dòng 2825.
test("CARE-NOTE-05-UTCID02 [B] Trước cửa sổ 1 giờ chưa được xem ghi chú cửa", async () => {
  const f = fixture(3600001); f.input.actor = actor(SITTER, 'PET_SITTER');
  await expect(f.service.getAccessNotes(f.input)).rejects.toMatchObject({ code: 'ACCESS_WINDOW_CLOSED', status: 403 });
});

// SRS: UC-37; III.13.1.1 dòng 5055: until check-out
test("CARE-NOTE-05-UTCID03 [A] Sau check-out phải thu hồi ghi chú dù chưa tới giờ kết thúc dự kiến", async () => {
  const f = fixture(-1800000); f.input.actor = actor(SITTER, 'PET_SITTER');
  f.state.visit.state = 'COMPLETED'; f.state.visit.checkOutAt = new Date(NOW - 1);
  await expect(f.service.getAccessNotes(f.input)).rejects.toBeDefined();
});

// SRS: UC-37; SRS III.13.1.1 Home access note, dòng 5054–5055; UC-41 bước 5, dòng 2825.
test("CARE-NOTE-05-UTCID04 [A] Sitter khác không được xem ghi chú cửa", async () => {
  const f = fixture(3600000); f.input.actor = actor('other-sitter', 'PET_SITTER');
  await expect(f.service.getAccessNotes(f.input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});

// SRS: UC-37; SRS III.13.1.1 Home access note, dòng 5054–5055; UC-41 bước 5, dòng 2825.
test("CARE-NOTE-05-UTCID05 [A] Sitter thay thế chưa bàn giao chưa được xem ghi chú cửa", async () => {
  const f = fixture(3600000); f.input.actor = actor(SITTER, 'PET_SITTER');
  f.state.visit.handoverRequired = true; f.state.visit.handoverAccepted = false;
  await expect(f.service.getAccessNotes(f.input)).rejects.toMatchObject({ code: 'HANDOVER_REQUIRED', status: 403 });
});
