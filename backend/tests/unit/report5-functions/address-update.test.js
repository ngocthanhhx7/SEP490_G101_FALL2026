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
  const target = createCustomerAddressService({ repository, clock: () => NOW.getTime() }).update;
  return { update: target, repository, state: () => committed };
}

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID01 [N] Đổi tên gợi nhớ của địa chỉ mình", async () => {
  const f = fixture();
  const actual = await f.update(CUSTOMER, ADDRESS, { label: 'Nhà mới', expectedVersion: 0 }, KEY);
  expect(actual).toMatchObject({ id: ADDRESS, label: 'Nhà mới', location: LOCATION });
  expect(f.state().addresses.find(row => row.id === ADDRESS).customerId).toBe(OWNER);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID02 [N] Sửa địa điểm khi không có booking chưa xong", async () => {
  const f = fixture();
  const location = '18 Đường Lá, phường Bình An';
  const actual = await f.update(CUSTOMER, ADDRESS, { location, expectedVersion: 0 }, KEY);
  expect(actual.location).toBe(location);
  expect(f.state().addresses.find(row => row.id === ADDRESS).location).toBe(location);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID03 [N] Xóa nội dung ghi chú vào nhà tùy chọn", async () => {
  const f = fixture();
  const actual = await f.update(CUSTOMER, ADDRESS, { privateAccessNotes: '', expectedVersion: 0 }, KEY);
  expect(actual.privateAccessNotes).toBe('');
  expect(f.state().addresses.find(row => row.id === ADDRESS).privateAccessNotes).toBe('');
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID04 [N] Sửa địa chỉ và ghi chú không làm thay đổi bản sao booking", async () => {
  const f = fixture({ bookingState: 'CONFIRMED' });
  const before = globalThis.structuredClone(f.state().bookings);
  const actual = await f.update(CUSTOMER, ADDRESS, { location: '18 Đường Lá',
    privateAccessNotes: 'Gọi chuông mới', expectedVersion: 0, confirmOpenBookingImpact: true }, KEY);
  expect(actual).toMatchObject({ location: '18 Đường Lá', privateAccessNotes: 'Gọi chuông mới' });
  expect(f.state().bookings).toEqual(before);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID05 [A] Không sửa địa chỉ của Customer khác", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().addresses);
  await expect(f.update(CUSTOMER, OTHER_ADDRESS, { label: 'Nhà mới', expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  expect(f.state().addresses).toEqual(before);
  expect(f.repository.updateAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID06 [A] Không lưu tên gợi nhớ rỗng", async () => {
  const f = fixture();
  await expect(f.update(CUSTOMER, ADDRESS, { label: '', expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.repository.updateAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID07 [A] Không lưu địa điểm rỗng", async () => {
  const f = fixture();
  await expect(f.update(CUSTOMER, ADDRESS, { location: '', expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.repository.updateAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID08 [A] Staff không được sửa địa chỉ Customer", async () => {
  const f = fixture();
  await expect(f.update({ ...CUSTOMER, roles: ['STAFF'] }, ADDRESS, { label: 'Nhà mới', expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.repository.runCustomerAddressCommand).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; Address copy data rule; GBR-01/02.
test("ADDRESS-04-UTCID09 [A] Chưa đăng nhập không được sửa địa chỉ", async () => {
  const f = fixture();
  await expect(f.update(null, ADDRESS, { label: 'Nhà mới', expectedVersion: 0 }, KEY))
    .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.repository.runCustomerAddressCommand).not.toHaveBeenCalled();
});
