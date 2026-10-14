const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export class RegistrationApiError extends Error {
  constructor(code, status = 0, details = {}) {
    super(code);
    this.name = 'RegistrationApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.fieldErrors = details.fieldErrors;
  }
}

export function normalizeDisplayName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeRegistrationContact(channel, value) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (channel === 'EMAIL') {
    const email = input.toLowerCase();
    return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
  }
  if (channel !== 'PHONE') return null;

  const compact = input.replace(/[\s()-]/g, '');
  if (E164_PATTERN.test(compact)) return compact;
  const digits = compact.replace(/^\+/, '');
  if (/^0[1-9]\d{8}$/.test(digits)) return `+84${digits.slice(1)}`;
  if (/^84[1-9]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export function createCustomerRegistrationApi({ fetchImpl = (...args) => fetch(...args) } = {}) {
  async function post(path, body) {
    let response;
    try {
      response = await fetchImpl(`/api/v1${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        body: JSON.stringify(body),
      });
    } catch {
      throw new RegistrationApiError('NETWORK_ERROR');
    }

    let envelope;
    try { envelope = await response.json(); }
    catch { throw new RegistrationApiError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status); }
    if (!response.ok) {
      throw new RegistrationApiError(envelope?.error?.code || 'HTTP_ERROR', response.status, {
        retryAfterSeconds: envelope?.error?.retryAfterSeconds,
        fieldErrors: envelope?.error?.fieldErrors,
      });
    }
    if (envelope?.meta?.schemaVersion !== 1 || !Object.hasOwn(envelope, 'data')) {
      throw new RegistrationApiError('INVALID_RESPONSE', response.status);
    }
    return { data: envelope.data, status: response.status, pending: response.status === 202 };
  }

  return Object.freeze({
    async requestOtp({ channel, contact }) {
      const result = await post('/otp-challenges', { channel, contact, purpose: 'REGISTER' });
      if (result.status !== 202 || typeof result.data?.challengeId !== 'string') {
        throw new RegistrationApiError('INVALID_RESPONSE', result.status);
      }
      return result.data;
    },
    async verifyAndRegister({ challengeId, channel, contact, code, displayName, policyVersions }) {
      const result = await post('/otp-verifications', {
        challengeId, channel, contact, purpose: 'REGISTER', code, displayName, policyVersions,
      });
      if (result.data?.authenticated !== true || !result.data?.user?.id) {
        throw new RegistrationApiError('REGISTRATION_NOT_COMPLETED', result.status);
      }
      return result.data;
    },
  });
}

export const customerRegistrationApi = createCustomerRegistrationApi();
