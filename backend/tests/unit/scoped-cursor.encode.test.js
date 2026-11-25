import { createHmac } from 'node:crypto';
import { describe, expect, test } from '@jest/globals';
import { createScopedCursor } from '../../src/utils/scoped-cursor.js';

const secret = 'synthetic-scoped-cursor-secret-001';
const config = { secret, namespace: 'sitter-list', clock: () => 1_000, ttlMs: 60 };

describe('CURSOR-01 encode', () => {
  test('UTCID01 returns a URL-safe token containing the signed position, context fingerprint and expiry', () => {
    const position = { id: 'row-1', createdAt: '2026-11-17T00:00:00Z' };
    const context = { actorId: 'sitter-1', state: 'ACTIVE' };
    const token = createScopedCursor(config).encode(position, context);
    const [payload, signature] = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))).toEqual([position, expect.any(String), 1_060]);
    expect(signature).toBe(createHmac('sha256', secret).update(`sitter-list\0${payload}`).digest('base64url'));
  });

  test('UTCID02 deterministically encodes the same position and context at the same clock value', () => {
    const codec = createScopedCursor(config);
    expect(codec.encode({ id: 'row-1' }, { actorId: 'sitter-1' }))
      .toBe(codec.encode({ id: 'row-1' }, { actorId: 'sitter-1' }));
  });

  test('UTCID03 changes the signed token when position changes', () => {
    const codec = createScopedCursor(config);
    expect(codec.encode({ id: 'row-1' }, { actorId: 'sitter-1' }))
      .not.toBe(codec.encode({ id: 'row-2' }, { actorId: 'sitter-1' }));
  });

  test('UTCID04 changes the signed token when context changes', () => {
    const codec = createScopedCursor(config);
    expect(codec.encode({ id: 'row-1' }, { actorId: 'sitter-1' }))
      .not.toBe(codec.encode({ id: 'row-1' }, { actorId: 'sitter-2' }));
  });

  test('UTCID05 supports Unicode and nested serializable position/context values', () => {
    const position = { id: 'đặc-biệt', after: { sequence: 2 } };
    const context = { filter: { city: 'Hồ Chí Minh' } };
    const codec = createScopedCursor(config);
    expect(codec.decode(codec.encode(position, context), context)).toEqual(position);
  });

  test('UTCID06 changes the signature when namespace changes', () => {
    const position = { id: 'row-1' }, context = { actorId: 'sitter-1' };
    expect(createScopedCursor({ ...config, namespace: 'one' }).encode(position, context))
      .not.toBe(createScopedCursor({ ...config, namespace: 'two' }).encode(position, context));
  });

  test.each([
    ['UTCID07', { secret: 'short', namespace: 'scope' }],
    ['UTCID08', { secret, namespace: '' }],
    ['UTCID09', { secret, namespace: null }]
  ])('%s rejects invalid signing configuration', (_id, value) => {
    expect(() => createScopedCursor(value)).toThrow(TypeError);
  });
});
