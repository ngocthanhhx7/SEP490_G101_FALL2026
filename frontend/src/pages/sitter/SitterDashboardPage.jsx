import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
export function SitterDashboardPage({ api = sitterDashboardApi }) {
  return <ProjectionPage api={api} kind="sitter-dashboard" roles={["PET_SITTER"]}
    title="Lịch chăm sóc của tôi" description="Theo dõi các buổi được giao và lời mời cần phản hồi." searchable={false} />;
}
