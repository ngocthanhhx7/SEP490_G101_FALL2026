import { changeUserRoles } from '../../src/services/user-admin-api.js';

const user = { id: 'synthetic-account', version: 2 };
test('single-role change replaces membership using the existing versioned API shape', async () => {
  const request = jest.fn(async () => ({ status: 200, data: { userId: user.id, version: 3, roles: ['STAFF'] } }));
  await expect(changeUserRoles(request, user, ['STAFF'], 'Synthetic role change')).resolves.toMatchObject({ roles: ['STAFF'] });
  expect(request).toHaveBeenCalledWith('/users/synthetic-account/role-decisions', {
    method: 'POST', body: { roles: ['STAFF'], expectedVersion: 2, reason: 'Synthetic role change' }
  });
});

test('mixed-role submissions and acknowledgements cannot be accepted as a successful single-role decision', async () => {
  const request = jest.fn(async () => ({ status: 200, data: { userId: user.id, version: 3, roles: ['CUSTOMER', 'STAFF'] } }));
  await expect(changeUserRoles(request, user, ['CUSTOMER', 'STAFF'], 'Synthetic role change')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(request).not.toHaveBeenCalled();
  await expect(changeUserRoles(request, user, ['STAFF'], 'Synthetic role change')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
