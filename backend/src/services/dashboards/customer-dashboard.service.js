import { createProjectionReader, metrics, visitRows } from './read-projection.js';
export function createCustomerDashboardService({ repository } = {}) {
  return createProjectionReader({ kind: 'customer-dashboard', roles: ["CUSTOMER"], repository,
    project: (snapshot, scope) => ({ metrics: metrics(snapshot, [["upcomingVisits", "Buổi sắp tới"], ["awaitingPaymentBookings", "Đơn đang chờ thanh toán trước"]]), items: visitRows(snapshot, scope, 'customerId') }) });
}
