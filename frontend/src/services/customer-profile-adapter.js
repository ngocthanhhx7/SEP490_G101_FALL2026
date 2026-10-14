export function createCustomerProfileAdapter(request) {
  if (typeof request !== 'function') throw new TypeError('An API request function is required');
  return Object.freeze({
    load: ({ signal } = {}) => request('/me/profile', { signal }),
    update: ({ displayName, expectedVersion }) => request('/me/profile', {
      method: 'PATCH', body: { displayName, expectedVersion }
    })
  });
}
