import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { staffDashboardApi } from '../../services/staff-dashboard-api.js';
export function StaffDashboardPage({ api = staffDashboardApi }) {
  return <ProjectionPage api={api} kind="staff-dashboard" roles={["STAFF"]}
    title="Tổng quan điều phối" description="Các buổi chăm sóc và trường hợp cần xử lý." searchable={false} />;
}
