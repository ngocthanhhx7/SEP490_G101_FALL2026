import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createEarningsRouter = options => createDashboardReadRouter({ ...options,
  path: '/me/earnings', roles: ['PET_SITTER'] });
