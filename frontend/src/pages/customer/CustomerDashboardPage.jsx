import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
export function CustomerDashboardPage({ api = customerDashboardApi }) {
  return <ProjectionPage api={api} kind="customer-dashboard" roles={["CUSTOMER"]}
    title="Tổng quan của tôi" description="Theo dõi lịch chăm sóc và việc cần thực hiện." searchable={false} />;
}
