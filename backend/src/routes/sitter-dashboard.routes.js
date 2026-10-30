import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createSitterDashboardRouter = options => createDashboardReadRouter({ ...options,
  path: '/dashboards/sitter', roles: ["PET_SITTER"] });
