import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import { payrollApi } from '../../services/payroll-api.js';
export function AdminPayrollPage({ api = payrollApi }) {
  return <ProjectionPage api={api} kind="payroll" roles={["ADMIN"]}
    title="Theo dõi tất toán" description="Yêu cầu tất toán theo tuần lịch Việt Nam; duyệt không đồng nghĩa đã chuyển tiền." searchable={false} />;
}
