import { ApiError } from './api-client.js';
export async function subscribeToNewsletter(email) {
  const response = await globalThis.fetch('/api/v1/newsletter/subscriptions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: globalThis.AbortSignal.timeout(15000), body: JSON.stringify({ email })
  });
  if (!response.ok) throw new ApiError('SUBSCRIPTION_UNAVAILABLE', response.status);
  const body = await response.json();
  if (body?.data?.status !== 'REQUESTED') throw new ApiError('INVALID_RESPONSE');
  return body.data;
}
