const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

export function hasRole(actorRoles, requiredRole) {
  if (!Array.isArray(actorRoles) || actorRoles.some(role => !ROLES.has(role)) || !ROLES.has(requiredRole)) return false;
  if (requiredRole === 'CUSTOMER' && actorRoles.some(role => ['ADMIN', 'STAFF', 'PET_SITTER'].includes(role))) return false;
  return (
    actorRoles.includes(requiredRole) ||
    (requiredRole === 'STAFF' && actorRoles.includes('ADMIN'))
  );
}
