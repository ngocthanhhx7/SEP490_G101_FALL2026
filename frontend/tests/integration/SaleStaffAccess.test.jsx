import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { UserRolesDialog } from '../../src/pages/admin/UserRolesDialog.jsx';

jest.mock('../../src/pages/admin/ProductOrderManagementPage.jsx', () => ({
  ProductOrderManagementPage: () => <h1>Quản lý đơn hàng</h1>
}));

jest.mock('../../src/pages/admin/CounterSalePage.jsx', () => ({ CounterSalePage: () => <h1>Bán tại quầy</h1> }));
const originalFetch = globalThis.fetch;
beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  globalThis.fetch = jest.fn(async (url) => ({ ok: true, status: 200, json: async () => ({
    data: url === '/api/v1/dashboards/sale-staff'
      ? { counts: { PREPARE: 0, AWAITING_PICKUP: 0, RETURNING: 0 } }
      : { unreadCount: 0, items: [] },
    meta: { schemaVersion: 1 }
  }) }));
});
afterEach(() => { globalThis.fetch = originalFetch; });

function open(path, role, state) {
  const sessionAdapter = {
    resolve: async () => ({
      status: 'authenticated',
      user: { id: 'synthetic', displayName: 'Tài khoản kiểm thử', roles: [role] }
    })
  };
  return render(<MemoryRouter initialEntries={[{ pathname: path, state }]}><App sessionAdapter={sessionAdapter} /></MemoryRouter>);
}

test.each(['/sign-in', '/register', '/sitter/apply', '/products'])('GBR-01 Sale Staff opens the sales workspace from %s', async path => {
  open(path, 'SALE_STAFF', { from: '/admin/users' });
  expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  const sidebar = screen.getByRole('complementary');
  expect(within(sidebar).getByText('Bán hàng')).toBeVisible();
  expect(within(sidebar).getAllByRole('link').map(link => link.textContent)).toEqual(['Tổng quan', 'Bán tại quầy', 'Đơn hàng', 'Nhập hàng', 'Tồn kho']);
});

test('Sale Staff opens the counter workspace', async () => {
  open('/admin/counter-sale', 'SALE_STAFF');
  expect(await screen.findByRole('heading', { name: 'Bán tại quầy' })).toBeVisible();
});

test('Permission Matrix Admin keeps the existing order menu', async () => {
  open('/admin/product-orders', 'ADMIN');
  expect(await screen.findByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible();
  expect(within(screen.getByRole('complementary')).getByRole('link', { name: 'Đơn hàng sản phẩm' })).toBeVisible();
});

test.each(['/admin/users', '/admin/products', '/admin/stock-adjustments', '/staff/dispatch', '/sitter/payroll', '/account/bookings'])('Permission Matrix Sale Staff is denied at %s', async path => {
  open(path, 'SALE_STAFF');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Về khu vực của tôi' })).toHaveAttribute('href', '/sale-staff/dashboard');
});

test('Sale Staff label appears in Account Settings and the avatar menu', async () => {
  open('/account/settings', 'SALE_STAFF');
  expect(await screen.findByLabelText('Vai trò tài khoản')).toHaveTextContent('Nhân viên bán hàng');
  const avatar = screen.getByRole('button', { name: /Tài khoản kiểm thử/ });
  fireEvent.click(avatar);
  expect(screen.getAllByText('Nhân viên bán hàng').length).toBeGreaterThan(1);
});

test('Admin can select Sale Staff while the Pet Sitter option stays disabled', () => {
  render(<MemoryRouter><UserRolesDialog user={{ id: 'synthetic', version: 1, displayName: 'Synthetic', roles: ['STAFF'] }}
    request={jest.fn()} onClose={jest.fn()} onChanged={jest.fn()} /></MemoryRouter>);
  expect(screen.getByRole('radio', { name: 'Nhân viên bán hàng' })).toBeEnabled();
  expect(screen.getByRole('radio', { name: 'Pet sitter' })).toBeDisabled();
});
