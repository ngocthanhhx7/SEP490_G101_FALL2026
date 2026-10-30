import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { RoleDashboardLayout } from '../../src/layouts/RoleDashboardLayout.jsx';
import { SitterEarningsPage } from '../../src/pages/sitter/SitterEarningsPage.jsx';
import { AdminDashboardPage } from '../../src/pages/admin/AdminDashboardPage.jsx';
import { SitterProfilePage } from '../../src/pages/sitter/SitterProfilePage.jsx';
import { SitterListPage } from '../../src/pages/customer/SitterListPage.jsx';
import { CustomerDashboardPage } from '../../src/pages/customer/CustomerDashboardPage.jsx';
import { SitterDashboardPage } from '../../src/pages/sitter/SitterDashboardPage.jsx';
import { StaffDashboardPage } from '../../src/pages/staff/StaffDashboardPage.jsx';
import { AdminPayrollPage } from '../../src/pages/admin/AdminPayrollPage.jsx';
import '../../src/styles/index.css';
const params = new globalThis.URLSearchParams(window.location.search);
const role = params.get('role') ?? 'PET_SITTER';
const page = params.get('page') ?? 'earnings';
const pages = { earnings: SitterEarningsPage, admin: AdminDashboardPage, profile: SitterProfilePage,
  directory: SitterListPage, customer: CustomerDashboardPage, sitter: SitterDashboardPage,
  staff: StaffDashboardPage, payroll: AdminPayrollPage };
const Page = pages[page] ?? SitterEarningsPage;
const id = 'a'.repeat(24);
const sessionAdapter = { resolve: async () => ({ status: 'authenticated', user: { id,
  displayName: 'Tài khoản tổng hợp', roles: [role] } }), logout: async () => {} };
const api = { read: async () => ({ data: { asOf: '2026-10-18T17:00:00Z', nextCursor: null,
  totalsScope: page === 'earnings' ? 'PAGE' : undefined, metrics: [{ key: 'count', label: 'Dữ liệu tổng hợp kiểm tra', value: 1 }],
  items: page === 'earnings' ? [{ id, visitId: id, state: 'Completed', accrued: 100000,
    pending: 10000, available: 30000, held: 20000, reserved: 40000, paid: 0,
    explanation: 'Ví dụ tổng hợp: khoản đang giữ chờ xử lý, chưa phải tiền đã chuyển.', ledgerReference: 'synthetic-ledger' }]
    : ['directory', 'profile'].includes(page) ? [{ id, displayName: 'Người chăm sóc tổng hợp',
      bio: 'Hồ sơ tổng hợp để kiểm tra hiển thị.', areas: ['Quận 1'], reviewCount: 0, rating: null }]
    : page === 'payroll' ? [{ id, displayName: 'Sitter tổng hợp', amountVnd: 100000,
      state: 'Approved', requestWeekKey: '2026-10-12' }]
    : [{ id, state: 'Assigned', startsAt: '2026-10-19T00:00:00+07:00' }] } }) };
createRoot(document.getElementById('root')).render(<BrowserRouter><SessionProvider adapter={sessionAdapter}>
  <RoleDashboardLayout role={role} navigationItems={[{ label: 'Trang kiểm tra P28', to: window.location.pathname }]}>
    <p>PROVISIONAL — dữ liệu tổng hợp</p><Page api={api} />
  </RoleDashboardLayout>
</SessionProvider></BrowserRouter>);
