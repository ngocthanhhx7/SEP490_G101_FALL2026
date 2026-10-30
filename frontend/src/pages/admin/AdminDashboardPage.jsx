import { OperationalDashboard } from '../dashboards/OperationalDashboard.jsx';
import { adminDashboardApi } from '../../services/admin-dashboard-api.js';
export function AdminDashboardPage({ api = adminDashboardApi }) {
  return <OperationalDashboard api={api} kind="admin" />;
}
