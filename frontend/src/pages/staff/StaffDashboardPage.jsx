import { OperationalDashboard } from '../dashboards/OperationalDashboard.jsx';
import { staffDashboardApi } from '../../services/staff-dashboard-api.js';
export function StaffDashboardPage({ api = staffDashboardApi }) {
  return <OperationalDashboard api={api} kind="staff" />;
}
