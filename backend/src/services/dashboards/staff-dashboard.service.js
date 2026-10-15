import { createProjectionReader, metrics, visitRows } from './read-projection.js';
export function createStaffDashboardService({ repository } = {}) {
  return createProjectionReader({ kind: 'staff-dashboard', roles: ["STAFF"], repository,
    project: (snapshot, scope) => ({ metrics: metrics(snapshot, [["unassignedVisits", "Buổi chưa phân công"], ["openCases", "Trường hợp đang mở"]]), items: visitRows(snapshot, scope, undefined) }) });
}
