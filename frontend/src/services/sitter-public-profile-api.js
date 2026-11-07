import { ApiError } from './api-client.js';
export function createSitterPublicProfileApi(request) {
  return Object.freeze({
    own: async ({ signal } = {}) => (await request('/sitter-public-profiles/me', { signal })).data,
    submit: async (body, key) => (await request('/sitter-public-profiles/me', { method: 'PUT', body, idempotencyKey: key })).data,
    list: async ({ signal, cursor, userId, state } = {}) => {
      const params = new globalThis.URLSearchParams();
      if (state) params.set('state',state);
      if (cursor) params.set('cursor', cursor);
      if (userId) params.set('userId', userId);
      return (await request(`/sitter-public-profiles${params.size ? '?' + params : ''}`, { signal })).data;
    },
    review: async (userId, body, key) => {
      if (!/^[a-f0-9]{24}$/i.test(userId)) throw new TypeError('Invalid sitter identity');
      const result=await request(`/sitter-public-profiles/${userId}/reviews`, { method: 'POST', body, idempotencyKey: key });
      if(result.pending||result.data?.userId!==userId||result.data.version!==body.expectedVersion+1||!['APPROVED','REJECTED'].includes(result.data.state))throw new ApiError('INVALID_RESPONSE');
      return result.data;
    }
  });
}
