import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createCustomerDashboardRouter = options => createDashboardReadRouter({ ...options,
  path: '/dashboards/customer', roles: ["CUSTOMER"] });
