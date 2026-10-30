import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { adminDashboardApi } from '../../services/admin-dashboard-api.js';
export function AdminDashboardPage({ api = adminDashboardApi }) {
  return <ProjectionPage api={api} kind="admin-dashboard" roles={["ADMIN"]}
    title="Tổng quan quản trị" description="Số liệu vận hành và hồ sơ cần xử lý." searchable={false} />;
}
