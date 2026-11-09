import { ApiError } from './api-client.js';
import { isSingleRole } from '../utils/role-access.js';

export async function changeUserRoles(request, user, roles, reason) {
  if (!isSingleRole(roles)) throw new ApiError('VALIDATION_FAILED', 422);
  const response = await request(`/users/${encodeURIComponent(user.id)}/role-decisions`, {
    method: 'POST', body: { roles, reason, expectedVersion: user.version }
  });
  if (response.pending || response.status === 202) throw new ApiError('ROLE_CHANGE_UNCERTAIN');
  const result = response.data;
  if (result?.userId !== user.id || result.version !== user.version + 1 || !isSingleRole(result.roles)
    || [...result.roles].sort().join(',') !== [...roles].sort().join(',')) throw new ApiError('INVALID_RESPONSE');
  return result;
}
