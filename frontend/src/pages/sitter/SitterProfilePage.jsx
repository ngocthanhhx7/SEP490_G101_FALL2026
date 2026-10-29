import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { sitterProfileApi } from '../../services/sitter-profile-api.js';
export function SitterProfilePage({ api = sitterProfileApi }) {
  return <ProjectionPage api={api} kind="sitter-profile" roles={["PET_SITTER"]}
    title="Hồ sơ người chăm sóc" description="Thông tin giới thiệu và đánh giá được phép hiển thị." filterDates={false} searchable={false} />;
}
