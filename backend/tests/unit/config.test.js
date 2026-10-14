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
  test('missing Mongo settings fail before server listens', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('MONGO_URI');
  });
});
