import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createSitterProfileRouter = options => createDashboardReadRouter({ ...options,
  path: '/me/sitter-profile', roles: ["PET_SITTER"] });
