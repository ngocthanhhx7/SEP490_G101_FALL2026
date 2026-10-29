import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './app-error.js';

export function createScopedCursor({ secret, namespace }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || !namespace) throw new TypeError('Cursor signing configuration required');
  const fingerprint = context => createHash('sha256').update(JSON.stringify(context)).digest('base64url');
  const sign = payload => createHmac('sha256', secret).update(`${namespace}\0${payload}`).digest('base64url');
  const invalid = () => { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid cursor'); };
  return Object.freeze({
    encode(position, context) {
      const payload = Buffer.from(JSON.stringify([position, fingerprint(context)])).toString('base64url');
      return Buffer.from(JSON.stringify([payload, sign(payload)])).toString('base64url');
    },
    decode(token, context) {
      try {
        if (typeof token !== 'string' || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) invalid();
        const [payload, signature] = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
        if (typeof payload !== 'string' || typeof signature !== 'string') invalid();
        const expected = Buffer.from(sign(payload));
        const received = Buffer.from(signature);
        if (expected.length !== received.length || !timingSafeEqual(expected, received)) invalid();
        const [position, suppliedContext] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (suppliedContext !== fingerprint(context) || !position || typeof position !== 'object') invalid();
        return position;
      } catch { invalid(); }
    }
  });
}
