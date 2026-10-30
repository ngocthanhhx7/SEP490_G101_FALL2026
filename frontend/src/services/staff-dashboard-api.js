import { createProjectionApi } from './dashboard-projection-api.js';
export const createStaffDashboardApi = options => createProjectionApi({ ...options, kind: 'staff-dashboard', path: '/dashboards/staff' });
export const staffDashboardApi = createStaffDashboardApi();
