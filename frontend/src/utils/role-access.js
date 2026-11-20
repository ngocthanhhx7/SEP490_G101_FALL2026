const ACCOUNT_ROLES = ['ADMIN', 'STAFF', 'SALE_STAFF', 'PET_SITTER', 'CUSTOMER'];
const LANDINGS = { ADMIN: '/admin/dashboard', STAFF: '/staff', SALE_STAFF: '/sale-staff/dashboard', PET_SITTER: '/sitter', CUSTOMER: '/' };

export function isSingleRole(roles) {
  return Array.isArray(roles) && roles.length === 1 && ACCOUNT_ROLES.includes(roles[0]);
}

export function userRoles(user) {
  return Array.isArray(user?.roles) ? user.roles : [user?.role];
}

export function primaryRole(user) {
  const roles = userRoles(user);
  return isSingleRole(roles) ? roles[0] : undefined;
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

export function loginDestination(user, from, { mobile = false } = {}) {
  const fallback = mobile && primaryRole(user) === 'CUSTOMER' ? '/customer' : roleLanding(user);
  if (typeof from !== 'string' || !/^\/[a-zA-Z0-9]/.test(from)
    || /[\\\u0000-\u0020]/.test(from)) return fallback;
  const path = from.split(/[?#]/)[0];
  if (path.includes('%') || path.split('/').some(segment => segment === '.' || segment === '..')) return fallback;
  if (['/services', '/grooming-booking'].includes(path)) return hasRole(user, 'CUSTOMER') ? from : fallback;
  if (/^\/(?:visits\/[^/]+\/incidents\/new|cases\/[^/]+|incidents)$/.test(path)) {
    return ['CUSTOMER', 'PET_SITTER', 'ADMIN', 'STAFF'].includes(primaryRole(user)) ? from : fallback;
  }
  if (path === '/sitter/application-status') return hasRole(user, 'CUSTOMER') ? from : fallback;
  if (['/account', '/account/settings', '/account/notifications'].includes(path)) return from;
  if ((path === LANDINGS.SALE_STAFF || path === '/admin/product-orders') && hasRole(user, 'SALE_STAFF')) return from;
  if (/^\/admin(?:\/|$)/.test(path)) return hasRole(user, 'ADMIN') ? from : fallback;
  if (/^\/staff(?:\/|$)/.test(path)) return hasRole(user, 'STAFF') ? from : fallback;
  if (/^\/sitter(?:\/|$)/.test(path)) return hasRole(user, 'PET_SITTER') ? from : fallback;
  if (/^\/(?:booking|customer|sitters|account)(?:\/|$)/.test(path)) return hasRole(user, 'CUSTOMER') ? from : fallback;
  if (/^\/products\/[a-f\d]{24}$/i.test(path)) return hasRole(user, 'CUSTOMER') ? from : fallback;
  return fallback;
}
