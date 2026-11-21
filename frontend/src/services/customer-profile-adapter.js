export function createCustomerProfileAdapter(request, { role = 'CUSTOMER' } = {}) {
  if (typeof request !== 'function') throw new TypeError('An API request function is required');
  const paths = {
    CUSTOMER: '/me/profile',
    PET_SITTER: '/me/sitter-personal-profile',
    ADMIN: '/me/admin-personal-profile',
    STAFF: '/me/staff-personal-profile',
    SALE_STAFF: '/me/sale-staff-personal-profile'
  };
  if (!Object.hasOwn(paths, role)) throw new TypeError('Unsupported personal profile role');
  const path = paths[role];
  return Object.freeze({
    load: ({ signal } = {}) => request(path, { signal }),
    update: (body) => request(path, {
      method: 'PATCH', body
    })
  });
}
