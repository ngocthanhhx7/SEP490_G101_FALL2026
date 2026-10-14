import { describe, expect, test } from '@jest/globals';
import { normalizeVietnamPhone, renderSms } from '../../src/services/sms-template.service.js';

const NOW = Date.parse('2026-10-14T00:00:00.000Z');
const command = overrides => ({ channel: 'SMS', kind: 'OTP', to: '+84901234567',
  operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'LOGIN', code: '012345',
  expiresAt: new Date(NOW + 300000).toISOString(), ...overrides });

describe('SMS OTP template and Vietnam phone normalization', () => {
  test.each([
    ['0901234567', '+84901234567'],
    ['+84 90 123 4567', '+84901234567'],
    ['84-90-123-4567', '+84901234567'],
    ['(090) 123-4567', '+84901234567']
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizeVietnamPhone(input)).toBe(expected);
  });

  test.each(['+12025550123', '0212345678', '+8490123456', '+849012345678', '0901234567<script>', '', null])(
    'rejects unsupported or malformed phone %s', input => expect(normalizeVietnamPhone(input)).toBeNull()
  );

  test('renders a short GSM-7 OTP message without changing leading zeroes', () => {
    const result = renderSms(command(), NOW);
    expect(result).toMatchObject({ to: '+84901234567', operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'LOGIN' });
    expect(result.content).toContain('012345');
    expect(result.content).toContain('Expires in 5 minutes');
    expect(result.content).toMatch(/^[\x20-\x7e]+$/);
    expect(result.content.length).toBeLessThan(160);
  });

  test('rejects wrong channel, wrong purpose and invalid OTP shape', () => {
    expect(renderSms(command({ channel: 'EMAIL' }), NOW).error).toBe('INVALID_REQUEST');
    expect(renderSms(command({ purpose: 'RESET_PASSWORD' }), NOW).error).toBe('INVALID_REQUEST');
    expect(renderSms(command({ code: '12345' }), NOW).error).toBe('INVALID_REQUEST');
    expect(renderSms(command({ operationId: 'not-an-id' }), NOW).error).toBe('INVALID_REQUEST');
  });

  test('distinguishes invalid phone and expired OTP', () => {
    expect(renderSms(command({ to: '+12025550123' }), NOW).error).toBe('INVALID_PHONE');
    expect(renderSms(command({ expiresAt: new Date(NOW).toISOString() }), NOW).error).toBe('EXPIRED');
    expect(renderSms(command({ expiresAt: new Date(NOW + 300001).toISOString() }), NOW).error).toBe('INVALID_REQUEST');
  });
});
