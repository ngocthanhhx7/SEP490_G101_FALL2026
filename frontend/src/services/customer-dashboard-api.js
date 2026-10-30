import { createProjectionApi } from './dashboard-projection-api.js';
export const createCustomerDashboardApi = options => createProjectionApi({ ...options, kind: 'customer-dashboard', path: '/dashboards/customer' });
export const customerDashboardApi = createCustomerDashboardApi();
