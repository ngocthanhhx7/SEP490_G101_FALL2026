import { expect, test } from '@jest/globals';
import { createScopedCursor } from '../../src/utils/scoped-cursor.js';

let now = 1_000;
const config = { secret: 'synthetic-scoped-cursor-secret-001', namespace: 'unit-cursor-v1', clock: () => now, ttlMs: 100 };
const context = { ownerId: 'owner-1', state: 'OPEN' };
const token = () => createScopedCursor(config).encode({ id: 'row-1' }, context);
const invalid = operation => expect(operation).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', status: 422 }));

test('UTCID01 decodes a signed, unexpired cursor in its original scope', () => {
  expect(createScopedCursor(config).decode(token(), context)).toEqual({ id: 'row-1' });
});

test('UTCID02 rejects a tampered token', () => {
  const value = token();
  invalid(() => createScopedCursor(config).decode(`${value.slice(0, -1)}A`, context));
});

test('UTCID03 rejects malformed tokens and invalid token types', () => {
  for (const value of [undefined, null, '', '!', 'a'.repeat(513)]) invalid(() => createScopedCursor(config).decode(value, context));
});

test('UTCID04 rejects cursors used with a different context or namespace', () => {
  invalid(() => createScopedCursor(config).decode(token(), { ...context, ownerId: 'owner-2' }));
  invalid(() => createScopedCursor({ ...config, namespace: 'other-cursor-v1' }).decode(token(), context));
});

test('UTCID05 rejects a cursor at its expiry boundary', () => {
  const value = token();
  now = 1_100;
  invalid(() => createScopedCursor(config).decode(value, context));
  now = 1_000;
});
