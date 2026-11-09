import { ACCOUNT_ROLES } from '../constants/account-roles.js';
const ROLES = new Set(ACCOUNT_ROLES);

export function isSingleRole(roles) {
  return Array.isArray(roles) && roles.length === 1 && ROLES.has(roles[0]);
}

export function hasRole(actorRoles, requiredRole) {
  if (!isSingleRole(actorRoles) || !ROLES.has(requiredRole)) return false;
  if (requiredRole === 'CUSTOMER' && actorRoles.some(role => ['ADMIN', 'STAFF', 'PET_SITTER'].includes(role))) return false;
  return (
    actorRoles.includes(requiredRole) ||
    (requiredRole === 'STAFF' && actorRoles.includes('ADMIN'))
  );
}
