import { createProjectionReader, metrics, visitRows } from './read-projection.js';
export function createAdminDashboardService({ repository } = {}) {
  return createProjectionReader({ kind: 'admin-dashboard', roles: ["ADMIN"], repository,
    project: (snapshot, scope) => ({ metrics: metrics(snapshot, [["pendingApplications", "Hồ sơ chờ duyệt"], ["needsAction", "Cần xử lý"]]), items: visitRows(snapshot, scope, undefined) }) });
}
