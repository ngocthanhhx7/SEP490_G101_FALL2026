import { roleLanding } from '../../src/utils/role-access.js';

describe('FE-ROLE-03 roleLanding', () => {
  test.each([
    ['ADMIN', '/admin/dashboard'], ['STAFF', '/staff'], ['PET_SITTER', '/sitter'], ['CUSTOMER', '/']
  ])('UTCID%# returns the landing page for %s', (role, expected) => {
    expect(roleLanding({ roles: [role] })).toBe(expected);
  });

  test('UTCID05 returns sign-in for missing, multiple, or unknown roles', () => {
    expect(roleLanding()).toBe('/sign-in');
    expect(roleLanding({ roles: ['CUSTOMER', 'STAFF'] })).toBe('/sign-in');
    expect(roleLanding({ roles: ['ROOT'] })).toBe('/sign-in');
  });

  test('UTCID06 supports the legacy single role shape', () => {
    expect(roleLanding({ role: 'STAFF' })).toBe('/staff');
  });
});
