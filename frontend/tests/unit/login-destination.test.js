import { loginDestination } from '../../src/utils/role-access.js';

describe('FE-ROLE-04 loginDestination', () => {
  test('UTCID01 preserves a permitted Customer return path and query', () => {
    expect(loginDestination({ roles: ['CUSTOMER'] }, '/booking/service-1?visits=2')).toBe('/booking/service-1?visits=2');
  });

  test('UTCID02 preserves a permitted Admin path', () => {
    expect(loginDestination({ roles: ['ADMIN'] }, '/admin/users')).toBe('/admin/users');
  });

  test.each(['https://example.test', '//example.test', '/\\example.test', '/account/../admin', '/account/%2e%2e/admin'])('UTCID03 rejects unsafe return %s', (from) => {
    expect(loginDestination({ roles: ['CUSTOMER'] }, from)).toBe('/');
  });

  test('UTCID04 rejects a route outside the user role', () => {
    expect(loginDestination({ roles: ['CUSTOMER'] }, '/sitter/payroll')).toBe('/');
  });

  test('UTCID05 accepts the Customer-owned application status route', () => {
    expect(loginDestination({ roles: ['CUSTOMER'] }, '/sitter/application-status')).toBe('/sitter/application-status');
  });

  test('UTCID06 fails closed when roles are malformed', () => {
    expect(loginDestination({ roles: ['CUSTOMER', 'PET_SITTER'] }, '/booking/service-1')).toBe('/sign-in');
  });
});
