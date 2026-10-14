import { describe, expect, test } from '@jest/globals';
import { createContactCrypto, canonicalizeContact } from '../../src/services/contact-crypto.service.js';

const crypto = createContactCrypto({ lookupSecret: 'synthetic-lookup-secret-with-32-bytes-minimum',
  encryptionKey: '0123456789abcdef0123456789abcdef' });

describe('contact crypto', () => {
  test('canonicalizes contact values and hides plaintext behind keyed lookup digests', () => {
    const email = crypto.lookup('EMAIL', '  Person@example.test ');
    const normalized = crypto.lookup('EMAIL', 'person@example.test');
    expect(email.canonicalValue).toBe('person@example.test');
    expect(email.lookupKey).toBe(normalized.lookupKey);
    expect(email.lookupKey).not.toContain('person@example.test');
    expect(crypto.lookup('PHONE', '+84912345678').lookupKey).not.toBe(email.lookupKey);
  });

  test('encrypts contacts and rejects ciphertext tampering', () => {
    const encrypted = crypto.encrypt('person@example.test');
    expect(encrypted).not.toContain('person@example.test');
    expect(crypto.decrypt(encrypted)).toBe('person@example.test');
    const [iv, tag, ciphertext] = encrypted.split('.');
    const changed = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
    expect(() => crypto.decrypt(`${iv}.${tag}.${changed}`)).toThrow();
  });

  test.each([
    ['EMAIL', 'not-an-email'], ['PHONE', '0912345678'], ['PHONE', '+84912345678x'], ['OTHER', 'x']
  ])('rejects invalid %s contact values', (channel, value) => {
    expect(() => canonicalizeContact(channel, value)).toThrow();
  });
});
