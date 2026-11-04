import { identityModels } from '../../models/identity.model.js';

// +84912345678 -> 0912345678, the form people type and read. Other country codes stay as stored.
const toLocalForm = (canonical) => canonical.replace(/^\+84(\d{9})$/u, '0$1');

// Verified customer phone numbers for Admin order handling (D-217).
// Numbers are stored encrypted with a keyed lookup hash, so a search can only match a whole number, never part of one.
export function createCustomerPhoneDirectory({ connection, contactCrypto }) {
  const { Contact } = identityModels(connection);
  return Object.freeze({
    // phone is the canonical +84 form from the validator.
    async userIdsByPhone(phone) {
      const { lookupKey } = contactCrypto.lookup('PHONE', phone);
      const rows = await Contact.find({ channel: 'PHONE', state: 'VERIFIED', lookupKey }).select('userId').lean();
      return rows.map((row) => row.userId);
    },
    // Map of user id -> phone. A number that cannot be read is left out so one bad record cannot break the whole list.
    async phonesOf(userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await Contact.find({ userId: { $in: userIds }, channel: 'PHONE', state: 'VERIFIED' })
        .select('userId +canonicalCiphertext').lean();
      const phones = new Map();
      for (const row of rows) {
        try { phones.set(String(row.userId), toLocalForm(contactCrypto.decrypt(row.canonicalCiphertext))); } catch { /* skip */ }
      }
      return phones;
    }
  });
}
