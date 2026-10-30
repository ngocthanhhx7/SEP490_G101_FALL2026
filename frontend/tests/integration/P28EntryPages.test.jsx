import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSession } from '../../src/contexts/SessionContext.jsx';
import { SitterEarningsPage } from '../../src/pages/sitter/SitterEarningsPage.jsx';
import { AdminDashboardPage } from '../../src/pages/admin/AdminDashboardPage.jsx';
import { SitterProfilePage } from '../../src/pages/sitter/SitterProfilePage.jsx';
import { SitterListPage } from '../../src/pages/customer/SitterListPage.jsx';
import { CustomerDashboardPage } from '../../src/pages/customer/CustomerDashboardPage.jsx';
import { SitterDashboardPage } from '../../src/pages/sitter/SitterDashboardPage.jsx';
import { StaffDashboardPage } from '../../src/pages/staff/StaffDashboardPage.jsx';
import { AdminPayrollPage } from '../../src/pages/admin/AdminPayrollPage.jsx';
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: jest.fn() }));
test.each([
  [SitterEarningsPage, 'PET_SITTER', 'Thu nhập của tôi'],
  [AdminDashboardPage, 'ADMIN', 'Tổng quan quản trị'],
  [SitterProfilePage, 'PET_SITTER', 'Hồ sơ người chăm sóc'],
  [SitterListPage, 'CUSTOMER', 'Danh sách người chăm sóc'],
  [CustomerDashboardPage, 'CUSTOMER', 'Chăm sóc của bạn'],
  [SitterDashboardPage, 'PET_SITTER', 'Công việc của tôi'],
  [StaffDashboardPage, 'STAFF', 'Tổng quan điều phối'],
  [StaffDashboardPage, 'ADMIN', 'Tổng quan điều phối'],
  [AdminPayrollPage, 'ADMIN', 'Theo dõi tất toán'],
])('entry page for %s role %s', async (Page, role, title) => {
  useSession.mockReturnValue({ status: 'authenticated', user: { id: 'a'.repeat(24), roles: [role] } });
  const api = { read: jest.fn(async () => ({ pending: true })) };
  render(<MemoryRouter><Page api={api} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  await screen.findByText([AdminDashboardPage, CustomerDashboardPage, SitterDashboardPage, StaffDashboardPage].includes(Page) ? 'Chưa có dữ liệu vận hành' : 'Đang chờ tích hợp dữ liệu');
  expect(api.read).toHaveBeenCalledTimes(1);
});
