import { test, expect, jest } from '@jest/globals';
import { createCustomerAddressService } from '../../../src/services/customer-address.service.js';

const OWNER = '111111111111111111111111';
const OTHER = '222222222222222222222222';
const ADDRESS = '333333333333333333333333';
const OTHER_ADDRESS = '444444444444444444444444';
const CUSTOMER = { userId: OWNER, roles: ['CUSTOMER'], state: 'ACTIVE' };
const KEY = 'synthetic-address-command-01';
const LOCATION = '12 Đường Hoa, phường Bình An';
const NOTE = 'Bấm chuông ở cổng màu xanh';
const NOW = new Date('2026-11-14T03:00:00.000Z');

// Repository double chỉ lưu/lọc dữ liệu; quyết định cho phép lệnh nằm ở target thật.
function fixture({ bookingState } = {}) {
  let committed = {
    addresses: [
      { id: ADDRESS, customerId: OWNER, label: 'Nhà', location: LOCATION,
        privateAccessNotes: NOTE, isDefault: true, state: 'ACTIVE', version: 0,
        createdAt: NOW, updatedAt: NOW },
      { id: OTHER_ADDRESS, customerId: OTHER, label: 'Nhà khác chủ', location: LOCATION,
        privateAccessNotes: 'Ghi chú tổng hợp khác', isDefault: true, state: 'ACTIVE', version: 0,
        createdAt: NOW, updatedAt: NOW }
    ],
    bookings: bookingState ? [{ id: 'BOOK-SYNTHETIC', customerId: OWNER, addressId: ADDRESS,
      state: bookingState, addressSnapshot: { location: LOCATION, privateAccessNotes: NOTE } }] : []
  };
  const active = (state, customerId, addressId) => state.addresses.find(row =>
    row.customerId === customerId && row.id === addressId && row.state === 'ACTIVE');
  const repository = {
    runCustomerAddressCommand: jest.fn(async ({ execute }) => {
      const transaction = { state: globalThis.structuredClone(committed) };
      const result = await execute(transaction);
      committed = transaction.state;
      return result;
    }),
    listActiveAddresses: async () => { throw new Error('Port không dùng trong file này'); },
    findAssignedVisitSnapshot: async () => { throw new Error('Port không dùng trong file này'); },
    findActiveAddress: jest.fn(async ({ customerId, addressId, transaction }) =>
      globalThis.structuredClone(active(transaction.state, customerId, addressId) ?? null)),
    countActiveAddresses: jest.fn(async ({ customerId, transaction }) =>
      transaction.state.addresses.filter(row => row.customerId === customerId && row.state === 'ACTIVE').length),
    countOpenBookingsUsingAddress: jest.fn(async ({ customerId, addressId, transaction }) =>
      transaction.state.bookings.filter(row => row.customerId === customerId && row.addressId === addressId
        && !['COMPLETED', 'CANCELLED'].includes(row.state)).length),
    createAddress: jest.fn(async ({ customerId, values, now, transaction }) => {
      const created = { id: '555555555555555555555555', customerId, ...values,
        createdAt: now, updatedAt: now };
      transaction.state.addresses.push(created);
      return globalThis.structuredClone(created);
    }),
    updateAddress: jest.fn(async ({ customerId, addressId, expectedVersion, changes, now, transaction }) => {
      const current = active(transaction.state, customerId, addressId);
      if (!current || current.version !== expectedVersion) return null;
      Object.assign(current, changes, { version: current.version + 1, updatedAt: now });
      return globalThis.structuredClone(current);
    }),
    archiveAddress: jest.fn(async ({ customerId, addressId, expectedVersion, archivedAt, transaction }) => {
      const current = active(transaction.state, customerId, addressId);
      if (!current || current.version !== expectedVersion) return null;
      Object.assign(current, { state: 'ARCHIVED', isDefault: false, version: current.version + 1,
        archivedAt, updatedAt: archivedAt });
      return globalThis.structuredClone(current);
    })
  };
  const target = createCustomerAddressService({ repository, clock: () => NOW.getTime() }).archive;
  return { archive: target, repository, state: () => committed };
}

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
test("ADDRESS-05-UTCID01 [N] Xóa địa chỉ của mình khi không có booking chưa xong", async () => {
  const f = fixture();
  const actual = await f.archive(CUSTOMER, ADDRESS, { expectedVersion: 0 }, KEY);
  expect(actual).toMatchObject({ id: ADDRESS, state: 'ARCHIVED', isDefault: false });
  expect(f.state().addresses.find(row => row.id === ADDRESS).state).toBe('ARCHIVED');
  expect(f.state().addresses.find(row => row.id === OTHER_ADDRESS).state).toBe('ACTIVE');
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
test("ADDRESS-05-UTCID02 [A] Chặn xóa địa chỉ đang được booking chưa xong sử dụng", async () => {
  const f = fixture({ bookingState: 'CONFIRMED' });
  const before = globalThis.structuredClone(f.state());
  await expect(f.archive(CUSTOMER, ADDRESS, { expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 409 });
  expect(f.state()).toEqual(before);
  expect(f.repository.archiveAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
// DEF_ADDRESS_ARCHIVE_OPEN: giữ kỳ vọng SRS, không sửa runtime hoặc đảo kết quả.
test("ADDRESS-05-UTCID03 [A] Xác nhận vẫn không được xóa địa chỉ có booking chưa xong", async () => {
  const f = fixture({ bookingState: 'CONFIRMED' });
  const before = globalThis.structuredClone(f.state());
  await expect(f.archive(CUSTOMER, ADDRESS, { expectedVersion: 0, confirmOpenBookingImpact: true }, KEY))
    .rejects.toMatchObject({ status: 409 });
  expect(f.state()).toEqual(before);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
test("ADDRESS-05-UTCID04 [A] Không xóa địa chỉ của Customer khác", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state());
  await expect(f.archive(CUSTOMER, OTHER_ADDRESS, { expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  expect(f.state()).toEqual(before);
  expect(f.repository.archiveAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
test("ADDRESS-05-UTCID05 [A] Staff không được xóa địa chỉ Customer", async () => {
  const f = fixture();
  await expect(f.archive({ ...CUSTOMER, roles: ['STAFF'] }, ADDRESS, { expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.repository.runCustomerAddressCommand).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
test("ADDRESS-05-UTCID06 [A] Chưa đăng nhập không được xóa địa chỉ", async () => {
  const f = fixture();
  await expect(f.archive(null, ADDRESS, { expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.repository.runCustomerAddressCommand).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Protected records data rule; GBR-01/02.
test("ADDRESS-05-UTCID07 [N] Booking đã hoàn tất không chặn xóa địa chỉ", async () => {
  const f = fixture({ bookingState: 'COMPLETED' });
  const before = globalThis.structuredClone(f.state().bookings);
  const actual = await f.archive(CUSTOMER, ADDRESS, { expectedVersion: 0 }, KEY);
  expect(actual.state).toBe('ARCHIVED');
  expect(f.state().bookings).toEqual(before);
});
