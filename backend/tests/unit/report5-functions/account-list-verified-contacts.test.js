import { test, expect, jest } from '@jest/globals';
import { createAccountSettingsService } from '../../../src/services/account-settings.service.js';
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
  const listVerifiedContacts = createAccountSettingsService({ models: { Contact }, contactCrypto }).listVerifiedContacts;
  return { listVerifiedContacts, state, User, Contact, contactCrypto };
}

// SRS: III Account Settings; UC-04; GBR-02/06/27.
test("ACCOUNT-01-UTCID01 [N] Liệt kê contact verified email và phone của tài khoản CUSTOMER", async () => {
  const f=fixture({ onlyChannel: null });
  const actual=await f.listVerifiedContacts({ ...ACTOR, roles: ["CUSTOMER"] });
  expect(actual.map(c=>c.channel)).toEqual(["EMAIL", "PHONE"]);
  expect(actual.every(c=>c.state==='VERIFIED')).toBe(true);
  expect(actual.every(c=>typeof c.value==='string' && c.value.length>0)).toBe(true);
  expect(JSON.stringify(actual)).not.toContain('other@example.test');
  expect(JSON.stringify(actual)).not.toContain('pending@example.test');
  expect(JSON.stringify(actual)).not.toContain('lan@example.test');
  expect(JSON.stringify(actual)).not.toContain('+84912345678');
});

// SRS: III Account Settings; UC-04; GBR-02/06/27.
test("ACCOUNT-01-UTCID02 [N] Liệt kê contact verified PHONE của tài khoản CUSTOMER", async () => {
  const f=fixture({ onlyChannel: "PHONE" });
  const actual=await f.listVerifiedContacts({ ...ACTOR, roles: ["CUSTOMER"] });
  expect(actual.map(c=>c.channel)).toEqual(["PHONE"]);
  expect(actual.every(c=>c.state==='VERIFIED')).toBe(true);
  expect(actual.every(c=>typeof c.value==='string' && c.value.length>0)).toBe(true);
  expect(JSON.stringify(actual)).not.toContain('other@example.test');
  expect(JSON.stringify(actual)).not.toContain('pending@example.test');
  expect(JSON.stringify(actual)).not.toContain('lan@example.test');
  expect(JSON.stringify(actual)).not.toContain('+84912345678');
});

// SRS: III Account Settings; UC-04; GBR-02/06/27.
test("ACCOUNT-01-UTCID03 [N] Liệt kê contact verified EMAIL của tài khoản STAFF", async () => {
  const f=fixture({ onlyChannel: "EMAIL" });
  const actual=await f.listVerifiedContacts({ ...ACTOR, roles: ["STAFF"] });
  expect(actual.map(c=>c.channel)).toEqual(["EMAIL"]);
  expect(actual.every(c=>c.state==='VERIFIED')).toBe(true);
  expect(actual.every(c=>typeof c.value==='string' && c.value.length>0)).toBe(true);
  expect(JSON.stringify(actual)).not.toContain('other@example.test');
  expect(JSON.stringify(actual)).not.toContain('pending@example.test');
  expect(JSON.stringify(actual)).not.toContain('lan@example.test');
  expect(JSON.stringify(actual)).not.toContain('+84912345678');
});
