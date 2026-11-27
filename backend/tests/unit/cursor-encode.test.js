import { expect, test } from '@jest/globals';
import { createScopedCursor } from '../../src/utils/scoped-cursor.js';

const context = Object.freeze({ ownerId: 'owner-1', filters: { state: 'OPEN' } });
const position = Object.freeze({ id: 'row-1', createdAt: '2026-11-17T00:00:00.000Z' });
const makeCodec = overrides => createScopedCursor({
  secret: 'synthetic-scoped-cursor-secret-001', namespace: 'unit-cursor-v1', clock: () => 1_000, ttlMs: 100, ...overrides,
});

test('UTCID01 encodes a URL-safe signed cursor for a position and scope', () => {
  const token = makeCodec().encode(position, context);
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(makeCodec().decode(token, context)).toEqual(position);
});

test('UTCID02 uses the configured clock and TTL for the encoded expiry', () => {
  const token = makeCodec({ clock: () => 5_000, ttlMs: 250 }).encode(position, context);
  const [payload] = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  const [, , expiresAt] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  expect(expiresAt).toBe(5_250);
});

test('UTCID03 binds otherwise identical positions to their context', () => {
  const codec = makeCodec();
  expect(codec.encode(position, context)).not.toBe(codec.encode(position, { ...context, ownerId: 'owner-2' }));
});
