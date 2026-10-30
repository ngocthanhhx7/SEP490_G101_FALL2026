const ROLE_PRIORITY = ['ADMIN', 'STAFF', 'PET_SITTER', 'CUSTOMER'];
const LANDINGS = { ADMIN: '/admin/dashboard', STAFF: '/staff', PET_SITTER: '/sitter', CUSTOMER: '/' };

export function userRoles(user) {
  return Array.isArray(user?.roles) ? user.roles : [user?.role];
}

export function primaryRole(user) {
  const roles = userRoles(user);
  if (!roles.length || roles.some(role => !ROLE_PRIORITY.includes(role))) return undefined;
  return ROLE_PRIORITY.find(role => userRoles(user).includes(role));
}

export function hasRole(user, role) {
  const roles = userRoles(user);
  if (!primaryRole(user)) return false;
  if (role === 'CUSTOMER' && primaryRole(user) !== 'CUSTOMER') return false;
  return roles.includes(role) || (role === 'STAFF' && roles.includes('ADMIN'));
}

export function roleLanding(user) {
  return LANDINGS[primaryRole(user)] || '/sign-in';
}

export function loginDestination(user, from) {
  const fallback = roleLanding(user);
  if (typeof from !== 'string' || !/^\/[a-zA-Z0-9]/.test(from)
    || /[\\%\u0000-\u0020]/.test(from)) return fallback;
  const path = from.split(/[?#]/)[0];
  if (path.split('/').some(segment => segment === '.' || segment === '..')) return fallback;
  if (['/account', '/account/settings', '/account/notifications'].includes(path)) return from;
  if (/^\/admin(?:\/|$)/.test(path)) return hasRole(user, 'ADMIN') ? from : fallback;
  if (/^\/staff(?:\/|$)/.test(path)) return hasRole(user, 'STAFF') ? from : fallback;
  if (/^\/sitter(?:\/|$)/.test(path)) return hasRole(user, 'PET_SITTER') ? from : fallback;
  if (/^\/(?:booking|customer|sitters|account)(?:\/|$)/.test(path)) return hasRole(user, 'CUSTOMER') ? from : fallback;
  return fallback;
}
