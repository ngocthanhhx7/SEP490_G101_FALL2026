import { OperationalDashboard } from '../dashboards/OperationalDashboard.jsx';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
export function SitterDashboardPage({ api = sitterDashboardApi }) {
  return <OperationalDashboard api={api} kind="sitter" />;
}
