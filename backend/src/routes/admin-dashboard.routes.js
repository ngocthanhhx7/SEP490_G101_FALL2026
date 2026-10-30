import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createAdminDashboardRouter = options => createDashboardReadRouter({ ...options,
  path: '/dashboards/admin', roles: ["ADMIN"] });
