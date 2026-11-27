import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';

export const APPLICATION_INTAKE_COOKIE = 'pwc_application_intake';
const LIFETIME_MS = 2 * 60 * 60 * 1000;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// This capability owns temporary documents, never a User or an AuthSession.
export function createGuestIntakeService({ secret, clock = Date.now }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('Intake signing secret required');
  const sign = value => createHmac('sha256', secret).update(`application-intake-v1\0${value}`).digest('hex');
  function read(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{24}\.\d{13}\.[a-f0-9]{64}$/.test(token)) return null;
    const [userId, expires, signature] = token.split('.');
    if (Number(expires) <= clock() || Number(expires) > clock() + LIFETIME_MS || !equal(signature, sign(`${userId}.${expires}`))) return null;
    return { userId, csrfToken: sign(`csrf\0${token}`), token };
  }
  return {
    open(token) {
      const existing = read(token);
      if (existing) return existing;
      const payload = `${randomBytes(12).toString('hex')}.${clock() + LIFETIME_MS}`;
      return read(`${payload}.${sign(payload)}`);
    },
    authenticate(token, csrf) {
      const intake = read(token);
      if (!intake || !equal(intake.csrfToken, csrf)) throw new AppError(403, 'INTAKE_VERIFICATION_REQUIRED', 'Reopen the application form before continuing');
      return { userId: intake.userId };
    }
  };
}
