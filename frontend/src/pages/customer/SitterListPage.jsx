import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { sitterListApi } from '../../services/sitter-list-api.js';
export function SitterListPage({ api = sitterListApi }) {
  return <ProjectionPage api={api} kind="sitter-list" roles={["CUSTOMER", "STAFF", "ADMIN"]}
    title="Danh sách người chăm sóc" description="Tìm hiểu hồ sơ người chăm sóc; lựa chọn không đảm bảo đã nhận lịch." filterDates={false} searchable={true} />;
}
