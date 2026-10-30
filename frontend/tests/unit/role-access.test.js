import { hasRole, loginDestination, primaryRole, roleLanding } from '../../src/utils/role-access.js';

test.each([
  [['CUSTOMER'], '/', true],
  [['PET_SITTER'], '/sitter', false],
  [['STAFF'], '/staff', false],
  [['ADMIN'], '/admin/dashboard', false],
  [['CUSTOMER', 'PET_SITTER'], '/sitter', false],
  [['CUSTOMER', 'STAFF'], '/staff', false],
  [['CUSTOMER', 'ADMIN', 'STAFF'], '/admin/dashboard', false],
])('role matrix %j chooses %s and purchase=%s', (roles, landing, customer) => {
  const user = { roles };
  expect(roleLanding(user)).toBe(landing);
  expect(hasRole(user, 'CUSTOMER')).toBe(customer);
});

test.each(['https://example.test', '//example.test', '/\\example.test', '/account/../admin', '/account/%2e%2e/admin', '/sign-in', '/register', '/sitter/apply', null])('rejects unsafe or unsuitable return %s', from => {
  expect(loginDestination({ roles: ['CUSTOMER'] }, from)).toBe('/');
});

test('returns to a permitted private route and preserves its query', () => {
  expect(loginDestination({ roles: ['CUSTOMER'] }, '/booking/service-1?visits=2')).toBe('/booking/service-1?visits=2');
  expect(loginDestination({ roles: ['ADMIN'] }, '/staff/dispatch')).toBe('/staff/dispatch');
  expect(loginDestination({ roles: ['STAFF'] }, '/admin/users')).toBe('/staff');
  expect(loginDestination({ roles: ['CUSTOMER', 'PET_SITTER'] }, '/booking/service-1')).toBe('/sitter');
  expect(loginDestination({ roles: ['CUSTOMER'] }, '/sitter/payroll')).toBe('/');
});

test('malformed roles fail closed and legacy single role works', () => {
  expect(primaryRole({ roles: ['ADMIN', 'ROOT'] })).toBeUndefined();
  expect(primaryRole({ roles: [] })).toBeUndefined();
  expect(primaryRole(null)).toBeUndefined();
  expect(roleLanding({ role: 'STAFF' })).toBe('/staff');
});
