// Synthetic adapter tests: these do not prove backend authentication or RBAC.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { AppErrorBoundary } from '../../src/app/AppErrorBoundary.jsx';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';
import { RequireSession } from '../../src/routes/RequireSession.jsx';

const adapter = (result) => ({ resolve: async () => result });
function renderApp(path, sessionAdapter) {
  return render(<MemoryRouter initialEntries={[path]}><App sessionAdapter={sessionAdapter} /></MemoryRouter>);
}

test('public route is readable before session resolution and uses brand asset', async () => {
  renderApp('/', { resolve: () => new Promise(() => {}) });
  expect(screen.getByRole('heading', { name: /Chăm pet/ })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Paw World Care' })).toHaveAttribute('src', '/assets/figma-public/header-Vector.svg');
  expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  expect(screen.getByRole('main')).toHaveFocus();
  await screen.findByRole('alert');
});

test('guest is redirected to OTP integration placeholder', async () => {
  renderApp('/account', adapter({ status: 'guest' }));
  expect(await screen.findByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Tài khoản' })).not.toBeInTheDocument();
});

test('default adapter shows pending instead of fabricating session', async () => {
  renderApp('/account');
  expect(await screen.findByRole('heading', { name: 'Kết nối phiên đang chờ hoàn thiện' })).toBeVisible();
});

test('authenticated session opens account; unknown routes remain public', async () => {
  const view = renderApp('/account', adapter({ status: 'authenticated', user: {
    id: '507f1f77bcf86cd799439001', displayName: 'Nguyễn Admin', roles: ['ADMIN']
  } }));
  expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeVisible();
  expect(within(screen.getByRole('main')).getByText('Nguyễn Admin')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Chỉnh sửa hồ sơ' })).toHaveAttribute('href', '/account/profile');
  view.unmount();
  renderApp('/missing', { resolve: () => new Promise(() => {}) });
  expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
});

test.each(['ADMIN', 'STAFF', 'SALE_STAFF', 'PET_SITTER'])('opens personal profile from the account for %s', async role => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({
    data: { displayName: 'Synthetic', version: 0, contacts: [] }, meta: { schemaVersion: 1 }
  }) }));
  try {
    renderApp('/account', adapter({ status: 'authenticated', user: { id: 'synthetic', displayName: 'Synthetic', roles: [role] } }));
    fireEvent.click(await screen.findByRole('link', { name: 'Chỉnh sửa hồ sơ' }));
    expect(await screen.findByRole('heading', { name: 'Thông tin cá nhân', level: 1 })).toBeVisible();
    expect(await screen.findByRole('textbox', { name: 'Họ và tên đệm' })).toBeVisible();
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('sitter can open application status without bouncing to the dashboard', async () => {
  const previousFetch = globalThis.fetch;
  const fetch = globalThis.fetch = jest.fn(async url => ({
    ok: true, status: 200, json: async () => ({
      data: String(url).endsWith('/applications/me') ? { application: null } : { items: [], unreadCount: 0 },
      meta: { schemaVersion: 1 }
    })
  }));
  try {
    renderApp('/sitter/application-status', adapter({ status: 'authenticated', user: {
      id: 'aaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Sitter', roles: ['PET_SITTER']
    } }));
    expect(await screen.findByRole('heading', { name: 'Bạn chưa có hồ sơ ứng tuyển' })).toBeVisible();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/applications/me'))).toBe(true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('failed session can retry and fails closed for unknown roles', async () => {
  const resolve = jest.fn().mockRejectedValueOnce(Error()).mockResolvedValueOnce({ status: 'guest' });
  renderApp('/account', { resolve });
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kiểm tra phiên');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
});

test.each([['ADMIN', true], ['STAFF', true], ['CUSTOMER', false], ['PET_SITTER', false], ['UNKNOWN', false]])
('role gate for staff: %s allowed=%s (UX only)', async (role, allowed) => {
  render(<MemoryRouter><SessionProvider adapter={adapter({ status: 'authenticated', user: { role } })}>
    <Routes><Route element={<RequireSession roles={['STAFF']} />}>
      <Route index element={<p>Protected synthetic content</p>} />
    </Route></Routes>
  </SessionProvider></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Đang kiểm tra phiên…')).not.toBeInTheDocument());
  expect(Boolean(screen.queryByText('Protected synthetic content'))).toBe(allowed);
  if (!allowed) expect(screen.getByRole('alert')).toBeVisible();
});

function InvalidateControl() {
  const session = useSession();
  return <><button onClick={session.invalidate}>Invalidate</button><p>Session: {session.status}</p></>;
}

test('invalidation wins against a late session resolve', async () => {
  let complete;
  const resolve = () => new Promise((done) => { complete = done; });
  render(<MemoryRouter><SessionProvider adapter={{ resolve }}>
    <InvalidateControl />
  </SessionProvider></MemoryRouter>);
  await waitFor(() => expect(complete).toBeDefined());
  fireEvent.click(screen.getByText('Invalidate'));
  await act(async () => complete({ status: 'authenticated', user: { role: 'ADMIN' } }));
  expect(screen.getByText('Session: guest')).toBeVisible();
});

test('render errors show safe recovery without stack details', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  function Broken() { throw Error('sensitive synthetic stack'); }
  try {
    render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể hiển thị trang');
    expect(screen.queryByText('sensitive synthetic stack')).not.toBeInTheDocument();
  } finally { spy.mockRestore(); }
});
