import { OperationalDashboard } from '../dashboards/OperationalDashboard.jsx';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
export function CustomerDashboardPage({ api = customerDashboardApi }) {
  return <OperationalDashboard api={api} kind="customer" />;
}
