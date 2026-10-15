import { createProjectionApi } from './dashboard-projection-api.js';
export const createSitterDashboardApi = options => createProjectionApi({ ...options, kind: 'sitter-dashboard', path: '/dashboards/sitter' });
export const sitterDashboardApi = createSitterDashboardApi();
