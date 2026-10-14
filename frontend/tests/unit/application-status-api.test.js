import { createApplicationStatusApi } from '../../src/services/application-status-api.js';

test('guest status API uses POST JSON without session CSRF and never places secret in URL', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 202,
    json: async () => ({ data: { challengeId: 'synthetic' }, meta: { schemaVersion: 1 } }) }));
  const api = createApplicationStatusApi({ fetchImpl });
  await api.requestVerification({ applicationCode: 'synthetic-private-code' });
  expect(fetchImpl).toHaveBeenCalledWith('/api/v1/application-status/challenges', expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    body: JSON.stringify({ applicationCode: 'synthetic-private-code' })
  }));
  await api.verifyAndReadStatus({ applicationCode: 'synthetic-private-code', code: '123456' });
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/application-status/verify');
});
