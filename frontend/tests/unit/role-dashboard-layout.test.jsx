import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { RoleDashboardLayout } from '../../src/layouts/RoleDashboardLayout.jsx';

const sessionAdapter = (result) => ({ resolve: async () => result });

function renderLayout({ role = 'CUSTOMER', result, navigationItems, children = <h1>Trang tổng quan</h1> }) {
  return render(<MemoryRouter initialEntries={['/customer']}>
    <SessionProvider adapter={sessionAdapter(result)}>
      <RoleDashboardLayout role={role} navigationItems={navigationItems}>{children}</RoleDashboardLayout>
    </SessionProvider>
  </MemoryRouter>);
}

test('authenticated role gets shared shell, role navigation, and route focus', async () => {
  renderLayout({
    role: 'CUSTOMER',
    result: { status: 'authenticated', user: { id: 'synthetic-user-1', displayName: 'Nguyễn An', roles: ['CUSTOMER'] } },
    navigationItems: [{ key: 'pets', label: 'Thú cưng', to: '/customer/pets' }],
  });
  expect(await screen.findByRole('heading', { name: 'Trang tổng quan' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Paw World Care' })).toHaveAttribute('src', '/assets/logo/ngang.svg');
  expect(screen.getByRole('navigation', { name: 'Điều hướng khách hàng' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Thú cưng' })).toHaveAttribute('href', '/customer/pets');
  await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
});

test('wrong role fails closed with a forbidden state', async () => {
  renderLayout({
    role: 'ADMIN',
    result: { status: 'authenticated', user: { id: 'synthetic-user-1', displayName: 'Nguyễn An', roles: ['CUSTOMER'] } },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền truy cập');
  expect(screen.queryByRole('banner')).not.toBeInTheDocument();
});

test('Admin may use the Staff shell where Staff UX is allowed', async () => {
  renderLayout({
    role: 'STAFF',
    result: { status: 'authenticated', user: { id: 'synthetic-user-2', displayName: 'Nhân viên mẫu', roles: ['ADMIN'] } },
    children: <h1>Trang làm việc của nhân viên</h1>,
  });
  expect(await screen.findByRole('heading', { name: 'Trang làm việc của nhân viên' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Nhân viên', level: 2 })).toBeVisible();
});

test('pending session renders an explicit pending state without fake identity', async () => {
  render(<MemoryRouter><SessionProvider>
    <RoleDashboardLayout role="CUSTOMER"><h1>Không hiển thị</h1></RoleDashboardLayout>
  </SessionProvider></MemoryRouter>);
  expect(await screen.findByText('Khu vực tài khoản sẽ khả dụng sau khi đăng nhập được kết nối.')).toBeVisible();
  expect(screen.queryByText('Không hiển thị')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Tài khoản/ })).not.toBeInTheDocument();
});

test('session error provides a real retry action', async () => {
  const resolve = jest.fn()
    .mockRejectedValueOnce(new Error('synthetic network error'))
    .mockResolvedValueOnce({
      status: 'authenticated',
      user: { id: 'synthetic-user-3', displayName: 'Nguyễn An', roles: ['CUSTOMER'] },
    });
  render(<MemoryRouter><SessionProvider adapter={{ resolve }}>
    <RoleDashboardLayout role="CUSTOMER"><h1>Trang tổng quan</h1></RoleDashboardLayout>
  </SessionProvider></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kiểm tra phiên');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('heading', { name: 'Trang tổng quan' })).toBeVisible();
});

test('empty route content has an explicit state', async () => {
  renderLayout({
    result: { status: 'authenticated', user: { id: 'synthetic-user-1', displayName: 'Nguyễn An', roles: ['CUSTOMER'] } },
    children: null,
  });
  expect(await screen.findByText('Chưa có trang trong khu vực này')).toBeVisible();
});
