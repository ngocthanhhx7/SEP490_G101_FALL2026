import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminUsersPage } from '../../src/pages/admin/AdminUsersPage.jsx';
import { App } from '../../src/app/App.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const { HTMLDialogElement } = window;
const admin = { id: '507f1f77bcf86cd799439001', displayName: 'Nguyễn Admin', roles: ['ADMIN'] };
const userRecord = {
  id: '507f1f77bcf86cd799439011', displayName: 'Lê Minh An', roles: ['CUSTOMER'], state: 'ACTIVE', version: 0,
  createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
  contacts: [{ channel: 'EMAIL', maskedValue: 'm•••@example.test' }]
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

function renderPage(apiRequest, adapter = { resolve: async () => ({ status: 'authenticated', user: admin }) }) {
  return render(<MemoryRouter><SessionProvider adapter={adapter}>
    <AdminUsersPage apiRequest={apiRequest} />
  </SessionProvider></MemoryRouter>);
}

test('Admin account screen loads the server projection and exposes its personal account/logout dropdown on hover', async () => {
  const apiRequest = jest.fn(async () => ({ data: { users: [userRecord], nextCursor: null }, status: 200 }));
  const logout = jest.fn(async () => {});
  renderPage(apiRequest, { resolve: async () => ({ status: 'authenticated', user: admin }), logout });

  expect(await screen.findByRole('heading', { name: 'Quản lý tài khoản' })).toBeVisible();
  expect(await screen.findByText('Lê Minh An')).toBeVisible();
  expect(screen.getByText('m•••@example.test')).toBeVisible();
  expect(apiRequest).toHaveBeenCalledWith('/users?limit=20', expect.objectContaining({ signal: expect.anything() }));

  const accountMenu = document.querySelector('.admin-account-menu');
  fireEvent.pointerEnter(accountMenu);
  const accountLink = screen.getAllByRole('link', { name: 'Quản lý tài khoản' })[0];
  expect(accountLink).toHaveAttribute('href', '/account');
  expect(screen.getByRole('button', { name: 'Mở tùy chọn tài khoản' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.pointerLeave(accountMenu);
  fireEvent.focus(screen.getByRole('button', { name: 'Mở tùy chọn tài khoản' }));
  expect(screen.getByRole('button', { name: 'Mở tùy chọn tài khoản' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});

test.each([
  ['empty', async () => ({ data: { users: [], nextCursor: null }, status: 200 }), 'Chưa có tài khoản phù hợp'],
  ['pending', async () => ({ data: { users: [], nextCursor: null }, status: 202, pending: true }), 'Danh sách chưa có phản hồi hoàn tất.'],
  ['forbidden', async () => { throw { status: 403, code: 'FORBIDDEN' }; }, 'Chỉ quản trị viên được xem danh sách tài khoản.'],
  ['error', async () => { throw { code: 'NETWORK_ERROR' }; }, 'Không thể kết nối máy chủ. Kiểm tra kết nối rồi thử tải lại.']
])('renders the %s account list state without claiming a result', async (_state, apiRequest, message) => {
  renderPage(jest.fn(apiRequest));
  expect(await screen.findByText(message)).toBeVisible();
});

test('shows loading, then follows and returns through opaque server pages', async () => {
  let releaseFirst;
  const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
  const apiRequest = jest.fn()
    .mockImplementationOnce(() => firstResponse)
    .mockResolvedValueOnce({ data: { users: [userRecord], nextCursor: null }, status: 200 })
    .mockResolvedValueOnce({ data: { users: [userRecord], nextCursor: 'next-page-token' }, status: 200 });
  renderPage(apiRequest);
  expect(screen.getByRole('status', { name: 'Đang tải danh sách' })).toBeVisible();
  releaseFirst({ data: { users: [userRecord], nextCursor: 'next-page-token' }, status: 200 });
  await screen.findByText('Lê Minh An');
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users?limit=20&cursor=next-page-token', expect.anything()));
  await screen.findByText('Trang 2');
  fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
  await screen.findByText('Trang 1');
  expect(apiRequest).toHaveBeenCalledTimes(3);
});

test('Admin filters, opens account details and confirms an audited state change from the server', async () => {
  let state = 'ACTIVE';
  let version = 0;
  const record = () => ({ ...userRecord, state, version });
  const apiRequest = jest.fn(async (path, options = {}) => {
    if (path.startsWith('/users?')) return { data: { users: [record()], nextCursor: null }, status: 200 };
    if (path === `/users/${userRecord.id}`) return { data: record(), status: 200 };
    if (path.endsWith('/lock-decisions') && options.method === 'POST') {
      state = options.body.action === 'LOCK' ? 'LOCKED' : 'ACTIVE';
      version += 1;
      return { data: { userId: userRecord.id, state, version }, status: 200 };
    }
    throw new Error('Unexpected synthetic request');
  });
  renderPage(apiRequest);

  await screen.findByText('Lê Minh An');
  fireEvent.change(screen.getByLabelText('Tìm tài khoản'), { target: { value: 'Le Minh' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users?limit=20&search=Le+Minh', expect.anything()));

  fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Lê Minh An' }));
  expect(await screen.findByText('99439011')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }));
  expect(screen.getByRole('alertdialog', { name: 'Xác nhận khóa tài khoản' })).toBeVisible();
  fireEvent.change(await screen.findByLabelText('Lý do quyết định', { exact: false }), { target: { value: 'Yêu cầu kiểm tra' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Khóa tài khoản' }).at(-1));

  expect(await screen.findByRole('status', { name: 'Đã khóa tài khoản' })).toHaveTextContent('Máy chủ đã xác nhận');
  expect(apiRequest).toHaveBeenCalledWith(`/users/${userRecord.id}/lock-decisions`, {
    method: 'POST', body: { action: 'LOCK', expectedVersion: 0, reason: 'Yêu cầu kiểm tra' }
  });
  await waitFor(() => expect(screen.getAllByText('Đã khóa').length).toBeGreaterThan(0));
});

test('customer and Staff sessions cannot open the Admin route', async () => {
  for (const role of ['CUSTOMER', 'STAFF']) {
    const adapter = { resolve: async () => ({ status: 'authenticated', user: { ...admin, roles: [role] } }) };
    const view = render(<MemoryRouter initialEntries={['/admin/users']}><App sessionAdapter={adapter} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
    expect(screen.queryByRole('heading', { name: 'Quản lý tài khoản' })).not.toBeInTheDocument();
    view.unmount();
  }
});
