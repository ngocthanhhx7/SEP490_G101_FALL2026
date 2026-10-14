import { createVisitBoardApi, vietnamDateTimeToUtc } from '../../src/services/visit-board-api.js';

test('Vietnam civil time conversion does not depend on browser timezone', () => {
  expect(vietnamDateTimeToUtc('2026-10-15T00:00')).toBe('2026-10-14T17:00:00.000Z');
  expect(() => vietnamDateTimeToUtc('2026-10-15')).toThrow('INVALID_LOCAL_TIME');
  expect(() => vietnamDateTimeToUtc('2026-02-30T09:00')).toThrow('INVALID_LOCAL_TIME');
});
test('bounded page and cursor are encoded once; full day is exclusive next midnight', async () => {
  const request = jest.fn(async () => ({ data: { items: [], nextCursor: null } }));
  await createVisitBoardApi(request).list({ date: '2026-10-15', kind: 'VISIT', cursor: 'opaque_cursor', needsAction: true });
  const url = new window.URL(request.mock.calls[0][0], 'http://localhost');
  expect(url.searchParams.get('limit')).toBe('20');
  expect(url.searchParams.get('fromAt')).toBe('2026-10-14T17:00:00.000Z');
  expect(url.searchParams.get('toAt')).toBe('2026-10-15T17:00:00.000Z');
  expect(url.searchParams.get('cursor')).toBe('opaque_cursor');
});
test('malformed success body rejected, 202 stays pending', async () => {
  await expect(createVisitBoardApi(async () => ({ data: [] })).list({ date: '2026-10-15' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(await createVisitBoardApi(async () => ({ pending: true })).list({ date: '2026-10-15' })).toEqual({ pending: true });
});
test('write uses shared CSRF/idempotency client; invalid visit paths are rejected', async () => {
  const request = jest.fn(async () => ({ data: {} })); const api = createVisitBoardApi(request);
  await api.assign('visit-1', { sitterId: 'sitter-1', expectedVersion: 1, reason: 'synthetic' }, 'operation-123');
  expect(request).toHaveBeenCalledWith('/visits/visit-1/assignments', expect.objectContaining({ method: 'POST', idempotencyKey: 'operation-123' }));
  await expect(api.detail('../private')).rejects.toMatchObject({ code: 'INVALID_RESOURCE_ID' });
});
test('malformed rows/details produce an error rather than rendering fake state', async () => {
  const api = createVisitBoardApi(async () => ({ data: { items: [{ kind: 'VISIT' }], nextCursor: null } }));
  await expect(api.list({ date: '2026-10-15' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(api.detail('visit-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
