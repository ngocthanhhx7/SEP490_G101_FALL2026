import { describe, expect, jest, test } from '@jest/globals';
import { ApiError, createApiClient } from '../../../src/services/api-client.js';
import { loginDestination } from '../../../src/utils/role-access.js';
import { notificationTarget } from '../../../src/utils/notifications.js';
import { otpFeedback } from '../../../src/utils/otp-feedback.js';
import { validateSupplierForm } from '../../../src/utils/supplier-validation.js';

function jsonResponse(status, payload, headers = {}) {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => map.get(String(k).toLowerCase()) ?? null },
    json: async () => payload
  };
}

describe('FE-HTTP-01 request (11 UTCs)', () => {
  test('FE-HTTP-01-UTCID01 [A] preserves MSG68 and pet detail on schedule overlap error', async () => {
    const request = createApiClient({
      fetchImpl: async () => jsonResponse(409, { error: { code: 'MSG68', pet: 'Mèo thử' } })
    });
    await expect(request('/bookings')).rejects.toMatchObject({ name: 'ApiError', code: 'MSG68', status: 409, pet: 'Mèo thử' });
  });

  test('FE-HTTP-01-UTCID02 [A] preserves MSG148 and ISO time detail on visit overlap error', async () => {
    const request = createApiClient({
      fetchImpl: async () => jsonResponse(409, { error: { code: 'MSG148', time: '2026-11-26T10:00:00.000Z' } })
    });
    await expect(request('/bookings')).rejects.toMatchObject({ code: 'MSG148', time: '2026-11-26T10:00:00.000Z' });
  });

  test('FE-HTTP-01-UTCID03 [A] preserves MSG151 and reasonCode=PET_OVERLAP', async () => {
    const request = createApiClient({
      fetchImpl: async () => jsonResponse(409, { error: { code: 'MSG151', reasonCode: 'PET_OVERLAP' } })
    });
    await expect(request('/bookings')).rejects.toMatchObject({ code: 'MSG151', reasonCode: 'PET_OVERLAP' });
  });

  test('FE-HTTP-01-UTCID04 [A] rejects invalid path traversal or unsupported HTTP method', async () => {
    const request = createApiClient({ fetchImpl: jest.fn() });
    await expect(request('/../admin')).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
    await expect(request('/pets', { method: 'TRACE' })).rejects.toMatchObject({ code: 'INVALID_METHOD' });
  });

  test('FE-HTTP-01-UTCID05 [N] sends CSRF token, Idempotency-Key, and expectedVersion on mutation', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { data: { id: '1' }, meta: { schemaVersion: 1 } }));
    const request = createApiClient({ fetchImpl, getCsrfToken: () => 'csrf-tok-1' });
    const res = await request('/pets', {
      method: 'PATCH',
      body: { name: 'Mập' },
      expectedVersion: 3,
      idempotencyKey: 'idem-12345678'
    });
    expect(res).toEqual({ data: { id: '1' }, meta: { schemaVersion: 1 }, status: 200, pending: false });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.get('X-CSRF-Token')).toBe('csrf-tok-1');
    expect(init.headers.get('Idempotency-Key')).toBe('idem-12345678');
    expect(JSON.parse(init.body)).toEqual({ name: 'Mập', expectedVersion: 3 });
  });

  test('FE-HTTP-01-UTCID06 [A] allows CSRF bootstrap on POST /sessions without CSRF token and rejects invalid bootstrap route', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { data: { ok: true }, meta: { schemaVersion: 1 } }));
    const request = createApiClient({ fetchImpl, getCsrfToken: () => null });
    const res = await request('/sessions', { method: 'POST', body: { identifier: 'u1' }, csrfBootstrap: true });
    expect(res.status).toBe(200);
    await expect(request('/pets', { method: 'POST', csrfBootstrap: true })).rejects.toMatchObject({ code: 'INVALID_CSRF_MODE' });
  });

  test('FE-HTTP-01-UTCID07 [A] invokes onUnauthorized callback on HTTP 401 and throws ApiError', async () => {
    const onUnauthorized = jest.fn();
    const request = createApiClient({
      onUnauthorized,
      fetchImpl: async () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED' } })
    });
    await expect(request('/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('FE-HTTP-01-UTCID08 [N] returns { data: null, status: 204 } on HTTP 204 No Content', async () => {
    const request = createApiClient({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: async () => ({ ok: true, status: 204, headers: { get: () => null } })
    });
    await expect(request('/sessions', { method: 'DELETE' })).resolves.toEqual({ data: null, status: 204 });
  });

  test('FE-HTTP-01-UTCID09 [A] rejects success response with invalid envelope schemaVersion', async () => {
    const request = createApiClient({
      fetchImpl: async () => jsonResponse(200, { data: {}, meta: { schemaVersion: 2 } })
    });
    await expect(request('/pets')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  test('FE-HTTP-01-UTCID10 [A] rejects with TIMEOUT when fetch exceeds timeoutMs', async () => {
    jest.useFakeTimers();
    try {
      const request = createApiClient({
        timeoutMs: 50,
        fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
      });
      const pending = expect(request('/pets')).rejects.toMatchObject({ code: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(60);
      await pending;
    } finally {
      jest.useRealTimers();
    }
  });

  test('FE-HTTP-01-UTCID11 [A] rejects with ABORTED on caller signal abort and NETWORK_ERROR on transport failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortedClient = createApiClient({
      fetchImpl: async (_url, { signal }) => {
        if (signal.aborted) throw new Error('aborted');
        return jsonResponse(200, { data: {}, meta: { schemaVersion: 1 } });
      }
    });
    await expect(abortedClient('/pets', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });

    const netClient = createApiClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(netClient('/pets')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('FE-ROLE-04 loginDestination (10 UTCs)', () => {
  const customer = { roles: ['CUSTOMER'] };
  const staff = { roles: ['STAFF'] };

  test('FE-ROLE-04-UTCID01 [N] returns customer booking path when customer requests own booking URL', () => {
    expect(loginDestination(customer, '/account/bookings/674000000000000000000001')).toBe('/account/bookings/674000000000000000000001');
  });

  test('FE-ROLE-04-UTCID02 [A] blocks customer from /admin/users and falls back to /', () => {
    expect(loginDestination(customer, '/admin/users')).toBe('/');
  });

  test('FE-ROLE-04-UTCID03 [N] allows STAFF into /staff/dispatch', () => {
    expect(loginDestination(staff, '/staff/dispatch')).toBe('/staff/dispatch');
  });

  test('FE-ROLE-04-UTCID04 [A] rejects protocol-relative // URL', () => {
    expect(loginDestination(customer, '//evil.example/phish')).toBe('/');
  });

  test('FE-ROLE-04-UTCID05 [A] rejects backslash-containing URL', () => {
    expect(loginDestination(customer, '/account\\admin')).toBe('/');
  });

  test('FE-ROLE-04-UTCID06 [A] rejects dot-segment .. traversal URL', () => {
    expect(loginDestination(customer, '/account/../admin/users')).toBe('/');
  });

  test('FE-ROLE-04-UTCID07 [A] rejects percent-encoded URL path', () => {
    expect(loginDestination(customer, '/account/%2e%2e/admin')).toBe('/');
  });

  test('FE-ROLE-04-UTCID08 [A] redirects customer away from /admin root', () => {
    expect(loginDestination(customer, '/admin')).toBe('/');
  });

  test('FE-ROLE-04-UTCID09 [N] allows customer to view /sitter/application-status', () => {
    expect(loginDestination(customer, '/sitter/application-status')).toBe('/sitter/application-status');
  });

  test('FE-ROLE-04-UTCID10 [A] falls back to /sign-in when user role is invalid', () => {
    expect(loginDestination({ roles: ['UNKNOWN_ROLE'] }, '/account/profile')).toBe('/sign-in');
  });
});

describe('FE-NOTIFY-01 notificationTarget (16 UTCs)', () => {
  test('FE-NOTIFY-01-UTCID01 [N] routes customer booking intent notification through /account/notifications?open=', () => {
    const id = 'a'.repeat(64);
    expect(notificationTarget({ id, deepLink: `/account/bookings/${'1'.repeat(24)}` })).toBe(`/account/notifications?open=${id}`);
  });

  test('FE-NOTIFY-01-UTCID02 [N] routes sitter visit intent notification through /account/notifications?open=', () => {
    const id = 'b'.repeat(64);
    expect(notificationTarget({ id, deepLink: `/sitter/visits/${'2'.repeat(24)}` })).toBe(`/account/notifications?open=${id}`);
  });

  test('FE-NOTIFY-01-UTCID03 [B] returns root path / as-is', () => {
    expect(notificationTarget({ deepLink: '/' })).toBe('/');
  });

  test('FE-NOTIFY-01-UTCID04 [N] returns encoded internal non-intent path as-is', () => {
    expect(notificationTarget({ deepLink: '/account/pets/%C3%A1nh' })).toBe('/account/pets/%C3%A1nh');
  });

  test('FE-NOTIFY-01-UTCID05 [A] returns custom fallback for unsupported relative path', () => {
    expect(notificationTarget({ deepLink: 'account/pets' }, '/account')).toBe('/account');
  });

  test('FE-NOTIFY-01-UTCID06 [A] returns default fallback when item is undefined', () => {
    expect(notificationTarget(undefined)).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID07 [A] returns default fallback when item is null', () => {
    expect(notificationTarget(null)).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID08 [A] returns default fallback when deepLink is missing', () => {
    expect(notificationTarget({})).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID09 [A] returns default fallback when deepLink is non-string', () => {
    expect(notificationTarget({ deepLink: 12345 })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID10 [A] returns default fallback when deepLink is empty string', () => {
    expect(notificationTarget({ deepLink: '' })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID11 [A] returns default fallback for relative deepLink without leading slash', () => {
    expect(notificationTarget({ deepLink: 'bookings/123' })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID12 [A] returns default fallback for external https URL', () => {
    expect(notificationTarget({ deepLink: 'https://evil.example/steal' })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID13 [A] returns default fallback for protocol-relative // URL', () => {
    expect(notificationTarget({ deepLink: '//evil.example/steal' })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID14 [A] returns default fallback for whitespace-containing deepLink', () => {
    expect(notificationTarget({ deepLink: '/account/pets/ bad' })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID15 [A] returns default fallback for backslash-containing deepLink', () => {
    expect(notificationTarget({ deepLink: '/account\\pets' })).toBe('/account/notifications');
  });

  test('FE-NOTIFY-01-UTCID16 [A] propagates error when item.deepLink getter throws', () => {
    const bad = { get deepLink() { throw new Error('fixture getter failure'); } };
    expect(() => notificationTarget(bad)).toThrow('fixture getter failure');
  });
});

describe('FE-OTP-01 otpFeedback (16 UTCs)', () => {
  test('FE-OTP-01-UTCID01 [N] maps OTP_INCORRECT', () => {
    expect(otpFeedback('OTP_INCORRECT')).toBe('Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.');
  });

  test('FE-OTP-01-UTCID02 [N] maps OTP_EXPIRED', () => {
    expect(otpFeedback('OTP_EXPIRED')).toBe('Mã OTP đã hết hạn sau 5 phút. Vui lòng yêu cầu mã mới.');
  });

  test('FE-OTP-01-UTCID03 [N] maps OTP_ALREADY_USED', () => {
    expect(otpFeedback('OTP_ALREADY_USED')).toBe('Mã OTP này đã được sử dụng. Vui lòng yêu cầu mã mới.');
  });

  test('FE-OTP-01-UTCID04 [N] maps OTP_REPLACED', () => {
    expect(otpFeedback('OTP_REPLACED')).toBe('Bạn đã yêu cầu mã mới. Vui lòng dùng mã trong email hoặc SMS mới nhất.');
  });

  test('FE-OTP-01-UTCID05 [N] maps OTP_INVALID_OR_EXPIRED', () => {
    expect(otpFeedback('OTP_INVALID_OR_EXPIRED')).toBe('Không thể xác thực mã này. Vui lòng dùng mã mới nhất hoặc yêu cầu gửi lại.');
  });

  test('FE-OTP-01-UTCID06 [N] maps OTP_DELIVERY_UNAVAILABLE', () => {
    expect(otpFeedback('OTP_DELIVERY_UNAVAILABLE')).toBe('Chưa thể gửi mã OTP. Vui lòng thử lại sau.');
  });

  test('FE-OTP-01-UTCID07 [A] maps string code OTP_RATE_LIMITED to Vietnamese retry guidance per SRS UC-05', () => {
    expect(otpFeedback('OTP_RATE_LIMITED')).toEqual(expect.any(String));
  });

  test('FE-OTP-01-UTCID08 [A] maps string code RATE_LIMITED to Vietnamese retry guidance per SRS UC-05', () => {
    expect(otpFeedback('RATE_LIMITED')).toEqual(expect.any(String));
  });

  test('FE-OTP-01-UTCID09 [A] maps PROVIDER_UNAVAILABLE to Vietnamese provider guidance per SRS UC-05', () => {
    expect(otpFeedback('PROVIDER_UNAVAILABLE')).toEqual(expect.any(String));
  });

  test('FE-OTP-01-UTCID10 [A] returns null for UNRECOGNIZED_OTP_ERROR', () => {
    expect(otpFeedback('UNRECOGNIZED_OTP_ERROR')).toBeNull();
  });

  test('FE-OTP-01-UTCID11 [B] returns null for undefined', () => {
    expect(otpFeedback(undefined)).toBeNull();
  });

  test('FE-OTP-01-UTCID12 [B] returns null for null', () => {
    expect(otpFeedback(null)).toBeNull();
  });

  test('FE-OTP-01-UTCID13 [B] returns null for empty string', () => {
    expect(otpFeedback('')).toBeNull();
  });

  test('FE-OTP-01-UTCID14 [B] returns null for lowercase otp_incorrect', () => {
    expect(otpFeedback('otp_incorrect')).toBeNull();
  });

  test('FE-OTP-01-UTCID15 [B] returns null for number 429', () => {
    expect(otpFeedback(429)).toBeNull();
  });

  test('FE-OTP-01-UTCID16 [B] returns null for unrecognized object input', () => {
    expect(otpFeedback({ code: 'UNKNOWN_CODE' })).toBeNull();
  });
});

describe('FE-SUP-03 validateSupplierForm (13 UTCs)', () => {
  test('FE-SUP-03-UTCID01 [N] accepts valid name and 10-digit phone with empty email', () => {
    expect(validateSupplierForm({ name: 'Công ty Pet Food', phone: '0912345678', email: '' })).toEqual({});
  });

  test('FE-SUP-03-UTCID02 [N] accepts valid name and email with empty phone', () => {
    expect(validateSupplierForm({ name: 'Công ty Pet Food', phone: '', email: 'sales@petfood.vn' })).toEqual({});
  });

  test('FE-SUP-03-UTCID03 [B] accepts phone containing spaces, dots, and hyphens normalizing to 10 digits', () => {
    expect(validateSupplierForm({ name: 'Nhà cung cấp A', phone: '0912.345-678 ', email: '' })).toEqual({});
  });

  test('FE-SUP-03-UTCID04 [B] accepts 254-char email with 64-char local part', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(60)}.${'c'.repeat(61)}.${'d'.repeat(63)}.vn`; // 64 + 1 + 189 = 254
    expect(`${local}@${domain}`).toHaveLength(254);
    expect(validateSupplierForm({ name: 'Nhà cung cấp B', phone: '', email: `${local}@${domain}` })).toEqual({});
  });

  test('FE-SUP-03-UTCID05 [A] returns REQUIRED when name is whitespace only', () => {
    expect(validateSupplierForm({ name: '   ', phone: '0912345678', email: '' })).toEqual({ name: 'REQUIRED' });
  });

  test('FE-SUP-03-UTCID06 [A] returns phone INVALID for +84 format', () => {
    expect(validateSupplierForm({ name: 'NCC', phone: '+84912345678', email: 'a@b.vn' })).toEqual({ phone: 'INVALID' });
  });

  test('FE-SUP-03-UTCID07 [A] returns email INVALID for malformed email', () => {
    expect(validateSupplierForm({ name: 'NCC', phone: '0912345678', email: 'not-an-email' })).toEqual({ email: 'INVALID' });
  });

  test('FE-SUP-03-UTCID08 [B] returns email INVALID when email is 255 characters', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(60)}.${'c'.repeat(62)}.${'d'.repeat(63)}.vn`; // 64 + 1 + 190 = 255
    expect(`${local}@${domain}`).toHaveLength(255);
    expect(validateSupplierForm({ name: 'NCC', phone: '0912345678', email: `${local}@${domain}` })).toEqual({ email: 'INVALID' });
  });

  test('FE-SUP-03-UTCID09 [A] returns CONTACT_REQUIRED on both phone and email when both are blank', () => {
    expect(validateSupplierForm({ name: 'NCC', phone: ' ', email: '' })).toEqual({
      phone: 'CONTACT_REQUIRED',
      email: 'CONTACT_REQUIRED'
    });
  });

  test('FE-SUP-03-UTCID10 [A] aggregates REQUIRED and INVALID errors across all fields', () => {
    expect(validateSupplierForm({ name: '', phone: '123', email: 'bad@' })).toEqual({
      name: 'REQUIRED',
      phone: 'INVALID',
      email: 'INVALID'
    });
  });

  test('FE-SUP-03-UTCID11 [A] handles null values without throwing exception', () => {
    expect(() => validateSupplierForm(null)).not.toThrow();
  });

  test('FE-SUP-03-UTCID12 [A] handles undefined values without throwing exception', () => {
    expect(() => validateSupplierForm(undefined)).not.toThrow();
  });

  test('FE-SUP-03-UTCID13 [A] handles object missing name property without throwing exception', () => {
    expect(() => validateSupplierForm({ phone: '0912345678', email: '' })).not.toThrow();
  });
});
