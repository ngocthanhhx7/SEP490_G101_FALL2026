import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { earningsApi } from '../../services/earnings-api.js';
export function SitterEarningsPage({ api = earningsApi }) {
  return <ProjectionPage api={api} kind="earnings" roles={["PET_SITTER"]}
    title="Thu nhập của tôi" description="Thu nhập theo từng buổi chăm sóc và sổ giao dịch." searchable={false} />;
}
