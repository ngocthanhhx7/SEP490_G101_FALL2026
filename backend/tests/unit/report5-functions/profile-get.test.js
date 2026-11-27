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
  const get = createCustomerProfileService({ User, Contact, contactCrypto }).get;
  return { get, state, User, Contact, contactCrypto };
}

// SRS: UC-11; III Customer Profile/Account Settings; GBR-02/06.
test("PROFILE-01-UTCID01 [N] Đọc hồ sơ của chính Customer và chỉ liên hệ verified được che", async () => {
  const f=fixture();
  const actual=await f.get(ACTOR);
  expect(actual).toMatchObject({ id: OWNER, displayName: 'Nguyễn Lan' });
  expect(actual.contacts.every(c=>typeof c.maskedValue==='string' && c.maskedValue.length>0)).toBe(true);
  expect(actual.contacts.map(c=>c.channel)).toEqual(['EMAIL','PHONE']);
  expect(actual.contacts[0].maskedValue).not.toBe('lan@example.test');
  expect(actual.contacts[1].maskedValue).not.toBe('+84912345678');
  expect(JSON.stringify(actual)).not.toContain('other@example.test');
  expect(f.User.updateOne).not.toHaveBeenCalled();
});

// SRS: GBR-27; III Account Settings email Not added.
test("PROFILE-01-UTCID02 [N] Customer chỉ có phone vẫn đọc được hồ sơ", async () => {
  const f=fixture({ onlyChannel: 'PHONE' });
  const actual=await f.get(ACTOR);
  expect(actual.contacts).toHaveLength(1);
  expect(actual.contacts[0].channel).toBe('PHONE');
});

// SRS: GBR-01/02; UC-11.
test("PROFILE-01-UTCID03 [A] Chưa đăng nhập không đọc hồ sơ", async () => {
  const f=fixture();
  await expect(f.get(null)).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.User.findOne).not.toHaveBeenCalled();
});
