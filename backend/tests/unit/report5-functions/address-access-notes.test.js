import { test, expect, jest } from '@jest/globals';
import { createCustomerAddressService } from '../../../src/services/customer-address.service.js';
const SITTER = '111111111111111111111111';
const VISIT = '222222222222222222222222';
const ACTOR = { userId: SITTER, roles: ['PET_SITTER'], state: 'ACTIVE' };
const START = Date.parse('2026-11-15T04:00:00.000Z');
function fixture({ now = START - 1800000, handoverRequired = false, handoverAccepted = false,
  checkOutAt = null, notes = 'Ghi chú cổng tổng hợp' } = {}) {
  const snapshot = { state: checkOutAt ? 'COMPLETED' : now >= START ? 'IN_PROGRESS' : 'ASSIGNED', startAt: new Date(START), checkOutAt,
    handoverRequired, handoverAccepted, privateAccessNotesSnapshot: notes };
  const repository = {
    runCustomerAddressCommand: jest.fn(), listActiveAddresses: jest.fn(), findActiveAddress: jest.fn(),
    countActiveAddresses: jest.fn(), countOpenBookingsUsingAddress: jest.fn(), createAddress: jest.fn(),
    updateAddress: jest.fn(), archiveAddress: jest.fn(),
    findAssignedVisitSnapshot: jest.fn(async ({ visitId, sitterId }) =>
      visitId === VISIT && sitterId === SITTER ? globalThis.structuredClone(snapshot) : null)
  };
  const accessNotes = createCustomerAddressService({ repository, clock: () => now }).accessNotes;
  return { accessNotes, repository };
}

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID01 [B] Trước giờ mở ghi chú 1 ms bị từ chối", async () => {
  const f = fixture({ now: START - 3600001 });
  await expect(f.accessNotes(ACTOR, VISIT)).rejects.toMatchObject({ status: 403, code: 'ACCESS_WINDOW_CLOSED' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID02 [B] Đúng 1 giờ trước visit được xem ghi chú", async () => {
  const f = fixture({ now: START - 3600000 });
  const actual = await f.accessNotes(ACTOR, VISIT);
  expect(actual).toEqual({ visitId: VISIT, privateAccessNotes: 'Ghi chú cổng tổng hợp' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID03 [N] Đang chăm sóc chưa check-out được xem ghi chú", async () => {
  const f = fixture({ now: START + 900000 });
  const actual = await f.accessNotes(ACTOR, VISIT);
  expect(actual).toEqual({ visitId: VISIT, privateAccessNotes: 'Ghi chú cổng tổng hợp' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID04 [B] Đúng lúc đã check-out không còn được xem", async () => {
  const f = fixture({ now: START + 1800000, checkOutAt: new Date(START + 1800000) });
  await expect(f.accessNotes(ACTOR, VISIT)).rejects.toMatchObject({ status: 403, code: 'ACCESS_WINDOW_CLOSED' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID05 [A] Replacement chưa xác nhận handover bị chặn", async () => {
  const f = fixture({ handoverRequired: true, handoverAccepted: false });
  await expect(f.accessNotes(ACTOR, VISIT)).rejects.toMatchObject({ status: 403, code: 'HANDOVER_REQUIRED' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID06 [N] Replacement đã xác nhận và trong giờ được xem", async () => {
  const f = fixture({ handoverRequired: true, handoverAccepted: true });
  const actual = await f.accessNotes(ACTOR, VISIT);
  expect(actual).toEqual({ visitId: VISIT, privateAccessNotes: 'Ghi chú cổng tổng hợp' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID07 [A] Sitter khác người được gán không xem được", async () => {
  const f = fixture({});
  await expect(f.accessNotes({ ...ACTOR, userId: '333333333333333333333333' }, VISIT)).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID08 [A] Customer không gọi được endpoint ghi chú của sitter", async () => {
  const f = fixture({});
  await expect(f.accessNotes({ ...ACTOR, roles: ['CUSTOMER'] }, VISIT)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID09 [A] Chưa đăng nhập không được xem ghi chú riêng tư", async () => {
  const f = fixture({});
  await expect(f.accessNotes(null, VISIT)).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
});

// SRS: UC-37/UC-41; III.7.3.2 Visit Details; Private access notes data rule; GBR-01/02.
test("ADDRESS-06-UTCID10 [N] Ghi chú tùy chọn để trống được trả rỗng trong cửa sổ hợp lệ", async () => {
  const f = fixture({ notes: '' });
  const actual = await f.accessNotes(ACTOR, VISIT);
  expect(actual).toEqual({ visitId: VISIT, privateAccessNotes: '' });
});
