export function createSitterPublicProfileApi(request) {
  return Object.freeze({
    own: async ({ signal } = {}) => (await request('/sitter-public-profiles/me', { signal })).data,
    submit: async (body, key) => (await request('/sitter-public-profiles/me', { method: 'PUT', body, idempotencyKey: key })).data,
    list: async ({ signal, cursor } = {}) => (await request(`/sitter-public-profiles${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal })).data,
    review: async (userId, body, key) => {
      if (!/^[a-f0-9]{24}$/i.test(userId)) throw new TypeError('Invalid sitter identity');
      return (await request(`/sitter-public-profiles/${userId}/reviews`, { method: 'POST', body, idempotencyKey: key })).data;
    }
  });
}
