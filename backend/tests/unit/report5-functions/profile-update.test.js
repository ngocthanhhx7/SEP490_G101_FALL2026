import { test, expect, jest } from '@jest/globals';
import { createCustomerProfileService } from '../../../src/services/customer-profile.service.js';
const OWNER = '111111111111111111111111';
const OTHER = '222222222222222222222222';
const ACTOR = { userId: OWNER, state: 'ACTIVE', roles: ['CUSTOMER'] };
const NOW = new Date('2026-11-14T03:00:00.000Z');
function fixture({ onlyChannel } = {}) {
  const state = { user: { _id: OWNER, displayName: 'Nguyễn Lan', roles: ['CUSTOMER'], state: 'ACTIVE',
    version: 0, createdAt: NOW, updatedAt: NOW }, contacts: [
    { _id: '333333333333333333333333', userId: OWNER, channel: 'EMAIL', state: 'VERIFIED', canonicalCiphertext: 'lan@example.test', verifiedAt: NOW },
    { _id: '444444444444444444444444', userId: OWNER, channel: 'PHONE', state: 'VERIFIED', canonicalCiphertext: '+84912345678', verifiedAt: NOW },
    { _id: '555555555555555555555555', userId: OTHER, channel: 'EMAIL', state: 'VERIFIED', canonicalCiphertext: 'other@example.test', verifiedAt: NOW },
    { _id: '666666666666666666666666', userId: OWNER, channel: 'EMAIL', state: 'PENDING', canonicalCiphertext: 'pending@example.test', verifiedAt: NOW }
  ].filter(row => !onlyChannel || row.channel === onlyChannel) };
  const matches = (row, filter) => Object.entries(filter).every(([key,value]) =>
    Array.isArray(row[key]) ? row[key].includes(value) : String(row[key]) === String(value));
  function query(read) {
    let limit = Infinity;
    const q = { select: () => q, sort: () => q, limit: n => { limit=n;return q; },
      lean: async () => { const v=read();return globalThis.structuredClone(Array.isArray(v) ? v.slice(0,limit) : v); } };
    return q;
  }
  const User = { findOne: jest.fn(filter => query(() => matches(state.user,filter) ? state.user : null)),
    exists: async filter => matches(state.user,filter),
    updateOne: jest.fn(async (filter, update) => {
      if (!matches(state.user,filter)) return { matchedCount: 0 };
      Object.assign(state.user,update.$set);
      for(const [key,value] of Object.entries(update.$inc ?? {}))state.user[key]+=value;
      return { matchedCount: 1 };
    }) };
  const Contact = { find: jest.fn(filter => query(() => state.contacts.filter(row=>matches(row,filter)))) };
  // Crypto dependency giả trả giá trị liên hệ tổng hợp, không kiểm thuật toán mã hóa ở file này.
  const contactCrypto = { decrypt: jest.fn(value => value) };
  const update = createCustomerProfileService({ User, Contact, contactCrypto }).update;
  return { update, state, User, Contact, contactCrypto };
}

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
test("PROFILE-02-UTCID01 [N] Đổi họ tên tiếng Việt của chính Customer", async () => {
  const f=fixture();
  const displayName="Trần Minh Anh";
  const actual=await f.update(ACTOR,{ displayName, expectedVersion: 0 });
  expect(actual.displayName).toBe(displayName);
  expect(f.state.user.displayName).toBe(displayName);
});

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
test("PROFILE-02-UTCID02 [B] Tên đúng 2 ký tự được lưu", async () => {
  const f=fixture();
  const displayName="An";
  const actual=await f.update(ACTOR,{ displayName, expectedVersion: 0 });
  expect(actual.displayName).toBe(displayName);
  expect(f.state.user.displayName).toBe(displayName);
});

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
test("PROFILE-02-UTCID03 [B] Tên đúng 50 ký tự được lưu", async () => {
  const f=fixture();
  const displayName="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const actual=await f.update(ACTOR,{ displayName, expectedVersion: 0 });
  expect(actual.displayName).toBe(displayName);
  expect(f.state.user.displayName).toBe(displayName);
});

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
// DEF_PROFILE_NAME_SHORT: giữ kỳ vọng SRS; chạy bình thường.
test("PROFILE-02-UTCID04 [B] Tên một ký tự phải bị từ chối", async () => {
  const f=fixture();
  const displayName="A";
  await expect(f.update(ACTOR,{ displayName, expectedVersion: 0 })).rejects.toBeDefined();
  expect(f.state.user.displayName).toBe('Nguyễn Lan');
});

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
// DEF_PROFILE_NAME_LONG: giữ kỳ vọng SRS; chạy bình thường.
test("PROFILE-02-UTCID05 [B] Tên 51 ký tự phải bị từ chối", async () => {
  const f=fixture();
  const displayName="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await expect(f.update(ACTOR,{ displayName, expectedVersion: 0 })).rejects.toBeDefined();
  expect(f.state.user.displayName).toBe('Nguyễn Lan');
});

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
// DEF_PROFILE_NAME_CHAR: giữ kỳ vọng SRS; chạy bình thường.
test("PROFILE-02-UTCID06 [A] Tên chứa chữ số phải bị từ chối", async () => {
  const f=fixture();
  const displayName="Lan123";
  await expect(f.update(ACTOR,{ displayName, expectedVersion: 0 })).rejects.toBeDefined();
  expect(f.state.user.displayName).toBe('Nguyễn Lan');
});

// SRS: III Customer Profile Full name; UC-11; MSG12: 2–50 chữ và dấu cách.
test("PROFILE-02-UTCID07 [A] Tên rỗng không được lưu", async () => {
  const f=fixture();
  const displayName="";
  await expect(f.update(ACTOR,{ displayName, expectedVersion: 0 })).rejects.toBeDefined();
  expect(f.state.user.displayName).toBe('Nguyễn Lan');
});

// SRS: UC-11; UC-04; GBR-06: contact chỉ đổi sau mã xác minh.
test("PROFILE-02-UTCID08 [A] Không thay email trực tiếp qua cập nhật hồ sơ", async () => {
  const f=fixture();
  await expect(f.update(ACTOR,{ displayName: 'Nguyễn Lan', expectedVersion: 0, email: 'new@example.test' }))
    .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.User.updateOne).not.toHaveBeenCalled();
});

// SRS: UC-11; III Customer Profile Emergency contact.
// DEF_PROFILE_EMERGENCY: giữ kỳ vọng SRS; chạy bình thường.
test("PROFILE-02-UTCID09 [N] Lưu đủ nhóm người liên hệ khẩn cấp theo Customer Profile", async () => {
  const f=fixture();
  // emergencyContact là probe cho nhóm SRS, chưa có field này trong hợp đồng hàm hiện tại.
  const emergencyContact={ name: 'Nguyễn An', phone: '0912345678', relationship: 'FAMILY' };
  const actual=await f.update(ACTOR,{ displayName: 'Nguyễn Lan', expectedVersion: 0, emergencyContact });
  expect(actual.emergencyContact).toEqual(emergencyContact);
});
