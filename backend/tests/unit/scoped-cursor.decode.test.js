import { describe, expect, test } from '@jest/globals';
import { createScopedCursor } from '../../src/utils/scoped-cursor.js';

const secret = 'synthetic-scoped-cursor-secret-001';
const invalidCode = fn => { try { fn(); } catch (error) { return error.code; } return null; };
const invalid = fn => expect(invalidCode(fn)).toBe('VALIDATION_FAILED');

describe('CURSOR-02 decode', () => {
  const context = { actorId: 'sitter-1', state: 'ACTIVE' };
  const make = (overrides = {}) => createScopedCursor({ secret, namespace: 'sitter-list', clock: () => 1_000, ttlMs: 60, ...overrides });

  test('UTCID01 returns the signed position for its original scope', () => {
    const codec = make(), position = { id: 'row-1' };
    expect(codec.decode(codec.encode(position, context), context)).toEqual(position);
  });

  test('UTCID02 returns Unicode and nested positions', () => {
    const codec = make(), position = { id: 'đặc-biệt', after: { sequence: 2 } };
    const scopedContext = { filter: { city: 'Hồ Chí Minh' } };
    expect(codec.decode(codec.encode(position, scopedContext), scopedContext)).toEqual(position);
  });

  test.each([
    ['UTCID03', value => ({ ...value, actorId: 'sitter-2' })],
    ['UTCID04', value => ({ ...value, state: 'INACTIVE' })]
  ])('%s rejects a token with a different context', (_id, change) => {
    const codec = make();
    invalid(() => codec.decode(codec.encode({ id: 'row-1' }, context), change(context)));
  });

  test('UTCID05 rejects a token signed for another namespace', () => {
    const token = make().encode({ id: 'row-1' }, context);
    invalid(() => make({ namespace: 'other-scope' }).decode(token, context));
  });

  test('UTCID06 rejects a token signed with another secret', () => {
    const token = make().encode({ id: 'row-1' }, context);
    invalid(() => make({ secret: 'other-synthetic-scoped-cursor-secret-002' }).decode(token, context));
  });

  test('UTCID07 rejects a token with a changed signature', () => {
    const codec = make(), token = codec.encode({ id: 'row-1' }, context);
    invalid(() => codec.decode(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, context));
  });

  test('UTCID08 rejects a token at its expiry boundary', () => {
    let now = 1_000;
    const codec = make({ clock: () => now });
    const token = codec.encode({ id: 'row-1' }, context);
    now = 1_060;
    invalid(() => codec.decode(token, context));
  });

  test.each([
    ['UTCID09', undefined], ['UTCID10', null], ['UTCID11', ''], ['UTCID12', 'not_base64!'], ['UTCID13', 'a'.repeat(513)]
  ])('%s rejects malformed token input', (_id, token) => invalid(() => make().decode(token, context)));

  test('UTCID14 rejects a structurally valid token with a missing signature', () => {
    const token = Buffer.from(JSON.stringify(['payload-only'])).toString('base64url');
    invalid(() => make().decode(token, context));
  });

  test('UTCID15 rejects a signed payload whose position is not an object', () => {
    const codec = make();
    invalid(() => codec.decode(codec.encode('not-an-object', context), context));
  });
});
