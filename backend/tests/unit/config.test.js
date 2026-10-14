import { describe, expect, test } from '@jest/globals';
import { loadConfig } from '../../src/config/environment.js';

const valid = { NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test', PORT: '0' };
describe('startup configuration', () => {
  test('accepts declared settings without exposing config in public payloads', () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(0);
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.trustProxyHops).toBe(0);
  });
  test.each([
    ['NODE_ENV', 'staging'], ['PORT', '-1'], ['PORT', 'NaN'], ['HOST', 'anywhere'],
    ['MONGO_URI', 'wrong://user:synthetic-secret@host'], ['MONGO_DB', 'admin'],
    ['READINESS_TIMEOUT_MS', '0'], ['RATE_LIMIT_MAX', '0'], ['TRUST_PROXY_HOPS', 'true'],
    ['ALLOW_DEV_ADMIN_SEED', 'yes']
  ])('rejects invalid %s with field names only', (key, value) => {
    expect(() => loadConfig({ ...valid, [key]: value })).toThrow(key);
    try { loadConfig({ ...valid, [key]: value }); } catch (err) {
      expect(err.message).not.toContain('synthetic-secret');
    }
  });
  test('production cannot opt into fixture admin seed', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', PORT: '3000', ALLOW_DEV_ADMIN_SEED: 'true' })).toThrow('ALLOW_DEV_ADMIN_SEED');
  });
  test('authentication and provider integrations stay disabled by default', () => {
    const config = loadConfig(valid);
    expect(config.auth).toEqual({ enabled: false });
    expect(config.secureCookies).toBe(false);
  });
  test('enabled authentication requires independent, sufficiently strong secrets', () => {
    const secrets = {
      OTP_HMAC_SECRET: 'o'.repeat(32),
      SESSION_TOKEN_SECRET: 't'.repeat(32),
      SESSION_CSRF_SECRET: 'c'.repeat(32),
      CONTACT_LOOKUP_SECRET: 'l'.repeat(32),
      CONTACT_ENCRYPTION_KEY: 'e'.repeat(32)
    };
    const config = loadConfig({ ...valid, AUTH_ENABLED: 'true', ...secrets });
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.contactEncryptionKey).toHaveLength(32);
    expect(() => loadConfig({ ...valid, AUTH_ENABLED: 'true', ...secrets, OTP_HMAC_SECRET: 'short' }))
      .toThrow('OTP_HMAC_SECRET');
    expect(() => loadConfig({ ...valid, AUTH_ENABLED: 'true', ...secrets, CONTACT_ENCRYPTION_KEY: 'e'.repeat(31) }))
      .toThrow('CONTACT_ENCRYPTION_KEY');
  });
  test('enabled provider configuration errors name fields and do not echo credentials', () => {
    expect(() => loadConfig({ ...valid, EMAIL_ENABLED: 'true', SMTP_PASSWORD: 'synthetic-private' }))
      .toThrow('SMTP_HOST');
    try { loadConfig({ ...valid, SMS_ENABLED: 'true', ESMS_SECRET_KEY: 'synthetic-private' }); }
    catch (error) {
      expect(error.message).toContain('ESMS_API_KEY');
      expect(error.message).not.toContain('synthetic-private');
    }
  });
  test('missing Mongo settings fail before server listens', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('MONGO_URI');
  });
});
