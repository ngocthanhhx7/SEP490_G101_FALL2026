import { hasRole, loginDestination, primaryRole, roleLanding } from '../../src/utils/role-access.js';

test.each([
  [['CUSTOMER'], '/', true],
  [['PET_SITTER'], '/sitter', false],
  [['STAFF'], '/staff', false],
  [['ADMIN'], '/admin/dashboard', false],
  [['CUSTOMER', 'PET_SITTER'], '/sign-in', false],
  [['CUSTOMER', 'STAFF'], '/sign-in', false],
  [['CUSTOMER', 'ADMIN', 'STAFF'], '/sign-in', false],
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
  expect(loginDestination({ roles: ['CUSTOMER', 'PET_SITTER'] }, '/booking/service-1')).toBe('/sign-in');
  expect(loginDestination({ roles: ['CUSTOMER'] }, '/sitter/payroll')).toBe('/');
});

test('malformed roles fail closed and legacy single role works', () => {
  expect(primaryRole({ roles: ['ADMIN', 'ROOT'] })).toBeUndefined();
  expect(primaryRole({ roles: [] })).toBeUndefined();
  expect(primaryRole(null)).toBeUndefined();
  expect(roleLanding({ role: 'STAFF' })).toBe('/staff');
});

test('owned applicant status is a valid customer return route',()=>{expect(loginDestination({roles:['CUSTOMER']},'/sitter/application-status')).toBe('/sitter/application-status');});

test('GBR-01 Sale Staff has a sales landing and no inherited workspace permissions', () => {
  const user = { roles: ['SALE_STAFF'] };
  expect(roleLanding(user)).toBe('/admin/product-orders');
  expect(hasRole(user, 'SALE_STAFF')).toBe(true);
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER', 'PET_SITTER']) expect(hasRole(user, role)).toBe(false);
  expect(loginDestination(user, '/admin/product-orders?tab=ALL')).toBe('/admin/product-orders?tab=ALL');
  expect(loginDestination(user, '/admin/users')).toBe('/admin/product-orders');
  expect(loginDestination(user, '/sitter/application-status')).toBe('/admin/product-orders');
  expect(loginDestination(user, '/products/0123456789abcdef01234567')).toBe('/admin/product-orders');
  expect(primaryRole({ roles: ['SALE_STAFF', 'STAFF'] })).toBeUndefined();
});
