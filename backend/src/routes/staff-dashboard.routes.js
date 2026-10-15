import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createStaffDashboardRouter = options => createDashboardReadRouter({ ...options,
  path: '/dashboards/staff', roles: ["STAFF"] });
