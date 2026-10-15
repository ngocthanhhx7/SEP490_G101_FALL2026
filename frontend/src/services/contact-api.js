import { ApiError } from './api-client.js';
export async function sendContactMessage(payload) {
  let response;
  try {
    response = await globalThis.fetch('/api/v1/contact/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: globalThis.AbortSignal.timeout(45000), body: JSON.stringify(payload)
    });
  } catch { throw new ApiError('CONTACT_DELIVERY_UNCERTAIN'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error?.code ?? 'CONTACT_UNAVAILABLE', response.status);
  if (body?.data?.status !== 'ACCEPTED') throw new ApiError('CONTACT_DELIVERY_UNCERTAIN');
  return body.data;
}
