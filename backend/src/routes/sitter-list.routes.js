import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createSitterListRouter = options => createDashboardReadRouter({ ...options,
  path: '/sitters', roles: ["CUSTOMER", "STAFF", "ADMIN"] });
