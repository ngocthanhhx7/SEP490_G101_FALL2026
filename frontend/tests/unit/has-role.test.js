import { describe, expect, test } from '@jest/globals';
import { hasRole } from '../../src/utils/role-access.js';

describe('FE-ROLE-02 hasRole', () => {
  test.each([
    ['UTCID01', { roles: ['CUSTOMER'] }, 'CUSTOMER', true],
    ['UTCID02', { roles: ['ADMIN'] }, 'ADMIN', true],
    ['UTCID03', { roles: ['ADMIN'] }, 'STAFF', true],
    ['UTCID04', { roles: ['STAFF'] }, 'STAFF', true],
    ['UTCID05', { roles: ['PET_SITTER'] }, 'PET_SITTER', true]
  ])('%s grants the role or ADMIN staff inheritance', (_id, user, role, expected) => {
    // Arrange

    // Act
    const result = hasRole(user, role);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['UTCID06', { roles: ['ADMIN'] }, 'CUSTOMER'],
    ['UTCID07', { roles: ['STAFF'] }, 'CUSTOMER'],
    ['UTCID08', { roles: ['CUSTOMER', 'STAFF'] }, 'CUSTOMER'],
    ['UTCID09', null, 'STAFF'],
    ['UTCID10', { roles: ['CUSTOMER'] }, 'ROOT']
  ])('%s denies Customer crossover, malformed identities, and unknown roles', (_id, user, role) => {
    // Arrange

    // Act
    const result = hasRole(user, role);

    // Assert
    expect(result).toBe(false);
  });
});
