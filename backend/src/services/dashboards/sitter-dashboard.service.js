import { createProjectionReader, metrics, visitRows } from './read-projection.js';
export function createSitterDashboardService({ repository } = {}) {
  return createProjectionReader({ kind: 'sitter-dashboard', roles: ["PET_SITTER"], repository,
    project: (snapshot, scope) => ({ metrics: metrics(snapshot, [["assignedVisits", "Buổi được giao"], ["pendingOffers", "Lời mời chờ phản hồi"]]), items: visitRows(snapshot, scope, 'sitterId') }) });
}
