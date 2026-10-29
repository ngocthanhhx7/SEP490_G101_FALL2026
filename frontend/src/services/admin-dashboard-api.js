import { createProjectionApi } from './dashboard-projection-api.js';
export const createAdminDashboardApi = options => createProjectionApi({ ...options, kind: 'admin-dashboard', path: '/dashboards/admin' });
export const adminDashboardApi = createAdminDashboardApi();
