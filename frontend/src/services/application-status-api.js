import { ApiError } from './api-client.js';

export function createApplicationStatusApi({ fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  async function post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(`/api/v1/application-status/${path}`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal: controller.signal
      });
      const envelope = await response.json();
      if (!response.ok) throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status);
      if (envelope?.meta?.schemaVersion !== 1 || !envelope.data) throw new ApiError('INVALID_RESPONSE');
      return envelope;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    requestVerification: body => post('challenges', body),
    verifyAndReadStatus: body => post('verify', body)
  });
}
export const applicationStatusApi = createApplicationStatusApi();
