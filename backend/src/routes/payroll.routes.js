import { createDashboardReadRouter } from './dashboard-read-router.js';
export const createPayrollRouter = options => createDashboardReadRouter({ ...options,
  path: '/payroll', roles: ["ADMIN"] });
