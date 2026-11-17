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
  const target = createCustomerAddressService({ repository, clock: () => NOW.getTime() }).create;
  return { create: target, repository, state: () => committed };
}

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-03-UTCID01 [N] Tạo địa chỉ của chính Customer kèm ghi chú vào nhà", async () => {
  const f = fixture();
  const actual = await f.create(CUSTOMER, { label: 'Nhà', location: LOCATION, privateAccessNotes: NOTE }, KEY);
  expect(actual).toMatchObject({ label: 'Nhà', location: LOCATION, privateAccessNotes: NOTE, state: 'ACTIVE' });
  expect(f.state().addresses.find(row => row.id === actual.id)).toMatchObject({ customerId: OWNER });
  expect(actual.customerId).toBeUndefined();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-03-UTCID02 [N] Tạo địa chỉ khi không nhập ghi chú tùy chọn", async () => {
  const f = fixture();
  const actual = await f.create(CUSTOMER, { label: 'Nhà', location: LOCATION }, KEY);
  expect(actual.privateAccessNotes).toBe('');
  expect(f.state().addresses.find(row => row.id === actual.id).customerId).toBe(OWNER);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-03-UTCID03 [A] Thiếu tên gợi nhớ không được tạo", async () => {
  const f = fixture();
  const input = { label: 'Nhà', location: LOCATION };
  delete input.label;
  await expect(f.create(CUSTOMER, input, KEY)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.repository.createAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-03-UTCID04 [A] Thiếu địa điểm không được tạo", async () => {
  const f = fixture();
  const input = { label: 'Nhà', location: LOCATION };
  delete input.location;
  await expect(f.create(CUSTOMER, input, KEY)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.repository.createAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-03-UTCID05 [A] Tên gợi nhớ rỗng không được tạo", async () => {
  const f = fixture();
  const input = { label: 'Nhà', location: LOCATION };
  input.label = '';
  await expect(f.create(CUSTOMER, input, KEY)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.repository.createAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-03-UTCID06 [A] Địa điểm rỗng không được tạo", async () => {
  const f = fixture();
  const input = { label: 'Nhà', location: LOCATION };
  input.location = '';
  await expect(f.create(CUSTOMER, input, KEY)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.repository.createAddress).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; GBR-01/02; I.4.4 Permission Matrix.
test("ADDRESS-03-UTCID07 [A] Staff không được tạo địa chỉ Customer", async () => {
  const f = fixture();
  await expect(f.create({ ...CUSTOMER, roles: ['STAFF'] }, { label: 'Nhà', location: LOCATION }, KEY))
    .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.repository.runCustomerAddressCommand).not.toHaveBeenCalled();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access; GBR-01/02; I.4.4 Permission Matrix.
test("ADDRESS-03-UTCID08 [A] Chưa đăng nhập không được tạo địa chỉ", async () => {
  const f = fixture();
  await expect(f.create(null, { label: 'Nhà', location: LOCATION }, KEY))
    .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.repository.runCustomerAddressCommand).not.toHaveBeenCalled();
});
