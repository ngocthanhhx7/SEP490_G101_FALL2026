import { newsletterModel } from '../models/newsletter-request.model.js';
import { createContactCrypto } from './contact-crypto.service.js';

export function createNewsletterService({ connection, auth, clock = Date.now }) {
  const Request = newsletterModel(connection);
  const crypto = createContactCrypto({ lookupSecret: auth.contactLookupSecret,
    encryptionKey: auth.contactEncryptionKey });
  return Object.freeze({ async request(email) {
    const contact = crypto.lookup('EMAIL', email);
    try {
      await Request.updateOne({ contactLookup: contact.lookupKey }, { $setOnInsert: {
        contactLookup: contact.lookupKey, contactCiphertext: crypto.encrypt(contact.canonicalValue),
        state: 'REQUESTED', requestedAt: new Date(clock()), source: 'PUBLIC_FOOTER'
      } }, { upsert: true, runValidators: true });
    } catch (error) { if (error?.code !== 11000) throw error; }
  } });
}
