export function createCustomerProfileAdapter(request, { sitter = false } = {}) {
  if (typeof request !== 'function') throw new TypeError('An API request function is required');
  const path = sitter ? '/me/sitter-personal-profile' : '/me/profile';
  return Object.freeze({
    load: ({ signal } = {}) => request(path, { signal }),
    update: (body) => request(path, {
      method: 'PATCH', body
    })
  });
}
