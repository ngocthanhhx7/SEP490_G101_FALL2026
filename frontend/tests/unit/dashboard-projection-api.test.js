import { createProjectionApi } from '../../src/services/dashboard-projection-api.js';
const data = { kind: 'earnings', asOf: '2026-10-15T02:00:00Z', timeZone: 'Asia/Ho_Chi_Minh', metrics: [], items: [], nextCursor: null };
test('passes cancellation and bounded filters to same origin client', async () => {
  const request = jest.fn(async () => ({ data }));
  const api = createProjectionApi({ path: '/me/earnings', kind: 'earnings', request });
  const signal = new AbortController().signal;
  await api.read({ from: '2026-10-18', cursor: 'signed_cursor', signal });
  expect(request).toHaveBeenCalledWith('/me/earnings?from=2026-10-18&cursor=signed_cursor', { signal });
});
test.each([null, { ...data, kind: 'payroll' }, { ...data, metrics: [{ key: 'x', label: 'x', value: NaN }] }, { ...data, items: [{}] }])('rejects malformed projection %j', async invalid => {
  const api = createProjectionApi({ path: '/me/earnings', kind: 'earnings', request: async () => ({ data: invalid }) });
  await expect(api.read()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
test('pending null is preserved; unknown ownership parameter rejected before HTTP', async () => {
  const request = jest.fn(async () => ({ pending: true, data: null }));
  const api = createProjectionApi({ path: '/me/earnings', kind: 'earnings', request });
  expect(await api.read()).toMatchObject({ pending: true });
  await expect(api.read({ ownerId: 'another' })).rejects.toMatchObject({ code: 'INVALID_FILTER' });
  expect(request).toHaveBeenCalledTimes(1);
});

test.each([
  { id: 'a'.repeat(24), visitId: 'b'.repeat(24), completedAt: 'invalid' },
  { id: 'a'.repeat(24), visitId: 'b'.repeat(24), completedAt: '2026-10-15T02:00:00Z', accrued: NaN },
])('rejects broken financial row instead of displaying NaN %j', async row => {
  const api = createProjectionApi({ path: '/me/earnings', kind: 'earnings', request: async () => ({ data: { ...data, items: [row] } }) });
  await expect(api.read()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
