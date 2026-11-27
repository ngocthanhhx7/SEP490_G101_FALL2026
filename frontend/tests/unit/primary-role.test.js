import { describe, expect, test } from '@jest/globals';
import { primaryRole } from '../../src/utils/role-access.js';

describe('FE-ROLE-01 primaryRole', () => {
  test.each([
    ['UTCID01', { roles: ['ADMIN'] }, 'ADMIN'],
    ['UTCID02', { roles: ['STAFF'] }, 'STAFF'],
    ['UTCID03', { roles: ['PET_SITTER'] }, 'PET_SITTER'],
    ['UTCID04', { roles: ['CUSTOMER'] }, 'CUSTOMER'],
    ['UTCID05', { role: 'STAFF' }, 'STAFF']
  ])('%s returns the sole supported role', (_id, user, expected) => {
    // Arrange

    // Act
    const result = primaryRole(user);

    // Assert
    expect(result).toBe(expected);
  });

  test.each([
    ['UTCID06', null],
    ['UTCID07', { roles: [] }],
    ['UTCID08', { roles: ['CUSTOMER', 'STAFF'] }],
    ['UTCID09', { roles: ['ROOT'] }]
  ])('%s rejects a missing, mixed, or unknown role set', (_id, user) => {
    // Arrange

    // Act
    const result = primaryRole(user);

    // Assert
    expect(result).toBeUndefined();
  });
});
