import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../utils/app-error.js';

function secretBytes(value, name) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
    throw new TypeError(`${name} must contain at least 32 bytes`);
  }
  return Buffer.from(value, 'utf8');
}

export function canonicalizeContact(channel, value) {
  if (channel === 'EMAIL' && typeof value === 'string') {
    const canonicalValue = value.trim().toLowerCase();
    if (canonicalValue.length <= 254 && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(canonicalValue)) {
      return canonicalValue;
    }
  }
  if (channel === 'PHONE' && typeof value === 'string') {
    const canonicalValue = value.trim();
    if (/^\+[1-9]\d{7,14}$/.test(canonicalValue)) return canonicalValue;
  }
  throw new AppError(422, 'VALIDATION_FAILED', 'Contact value is invalid');
}

export function createContactCrypto({ lookupSecret, encryptionKey, randomBytesImpl = randomBytes }) {
  const lookupKey = secretBytes(lookupSecret, 'lookupSecret');
  const key = secretBytes(encryptionKey, 'encryptionKey');
  if (key.length !== 32 || typeof randomBytesImpl !== 'function') throw new TypeError('encryptionKey must be exactly 32 bytes');

  function lookup(channel, value) {
    const canonicalValue = canonicalizeContact(channel, value);
    const digest = createHmac('sha256', lookupKey).update(`${channel}\0${canonicalValue}`).digest('hex');
    return Object.freeze({ canonicalValue, lookupKey: digest });
  }

  function encrypt(canonicalValue) {
    if (typeof canonicalValue !== 'string' || !canonicalValue) throw new TypeError('A canonical contact value is required');
    const iv = randomBytesImpl(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(canonicalValue, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
  }

  function decrypt(payload) {
    if (typeof payload !== 'string') throw new TypeError('Encrypted contact is invalid');
    const [ivValue, tagValue, ciphertextValue, extra] = payload.split('.');
    if (!ivValue || !tagValue || !ciphertextValue || extra !== undefined) throw new TypeError('Encrypted contact is invalid');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
  }

  return Object.freeze({ lookup, encrypt, decrypt });
}
