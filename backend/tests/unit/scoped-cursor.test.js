import { expect, test } from '@jest/globals';
import { createScopedCursor } from '../../src/utils/scoped-cursor.js';

test('cursor binds scope and namespace, rejects tampering and expires at its boundary', () => {
  let now = 1000;
  const config = { secret: 'synthetic-scoped-cursor-secret-001', namespace: 'one', clock: () => now, ttlMs: 100 };
  const codec = createScopedCursor(config);
  const context = { userId: 'one', query: 'abc' };
  const token = codec.encode({ id: 'row-one' }, context);
  expect(codec.decode(token, context)).toEqual({ id: 'row-one' });
  expect(() => codec.decode(token, { ...context, userId: 'two' })).toThrow();
  expect(() => createScopedCursor({ ...config, namespace: 'two' }).decode(token, context)).toThrow();
  expect(() => codec.decode(`${token.slice(0, -4)}AAAA`, context)).toThrow();
  now = 1100;
  expect(() => codec.decode(token, context)).toThrow();
});
