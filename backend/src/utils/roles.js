const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

export function hasRole(actorRoles, requiredRole) {
  if (!Array.isArray(actorRoles) || !ROLES.has(requiredRole)) return false;
  return (
    actorRoles.includes(requiredRole) ||
    (requiredRole === 'STAFF' && actorRoles.includes('ADMIN'))
  );
}
