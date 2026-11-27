import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';

const DASHBOARD = '/sale-staff/dashboard';
const DASHBOARD_API = '/api/v1/dashboards/sale-staff';
const ORDERS = '/admin/product-orders';
const STOCK = '/admin/stock';
const STOCK_API = '/api/v1/admin/stock-levels';
const COUNTS = { PREPARE: 3, AWAITING_PICKUP: 0, IN_TRANSIT: 1, RETURNING: 2, LOW_STOCK: 4, CLAIMS_TO_CHECK: 5 };
const STOCK_COUNTS = { ALL: 12, LOW_STOCK: COUNTS.LOW_STOCK };
const CARDS = [
  ['Đơn cần chuẩn bị', 'PREPARE', 'Cần chuẩn bị'],
  ['Đơn chờ khách đến lấy', 'AWAITING_PICKUP', 'Chờ khách lấy'],
  ['Kiện hoàn về cần kiểm', 'RETURNING', 'Đang hoàn về']
];
const auth = role => ({
  status: 'authenticated',
  user: { id: 'synthetic', displayName: 'Tài khoản kiểm thử', roles: [role] }
});

const response = (status, payload) => ({
  ok: status < 400, status, json: async () => ({ ...payload, meta: { schemaVersion: 1 } })
});

function dashboardResponse() {
  return response(200, { data: { counts: {
    PREPARE: COUNTS.PREPARE, AWAITING_PICKUP: COUNTS.AWAITING_PICKUP, RETURNING: COUNTS.RETURNING, LOW_STOCK: COUNTS.LOW_STOCK,
    CLAIMS_TO_CHECK: COUNTS.CLAIMS_TO_CHECK
  } } });
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  return <output aria-label="Đường dẫn hiện tại" data-navigation-type={navigationType}>{pathname}{search}</output>;
}

function open(path, adapter = { resolve: async () => auth('SALE_STAFF') }) {
  render(<MemoryRouter initialEntries={[path]}>
    <LocationProbe />
    <App sessionAdapter={adapter} />
  </MemoryRouter>);
}

const originalFetch = globalThis.fetch;
let readDashboard;
beforeEach(() => {
  readDashboard = jest.fn(async () => dashboardResponse());
  globalThis.fetch = jest.fn(async (url) => {
    if (url === DASHBOARD_API) return readDashboard();
    if (url.startsWith('/api/v1' + ORDERS + '?')) {
      return response(200, { data: { items: [], counts: COUNTS, page: 1, limit: 20, total: 0 } });
    }
    if (url.startsWith(STOCK_API + '?')) {
      return response(200, { data: { items: [], counts: STOCK_COUNTS, page: 1, limit: 20, total: 0 } });
    }
    return response(200, { data: { unreadCount: 0, items: [] } });
  });
});
afterEach(() => { globalThis.fetch = originalFetch; });

async function signIn(path) {
  open(path, {
    resolve: async () => ({ status: 'guest' }),
    requestLoginOtp: async () => ({ challengeId: 'synthetic-challenge', resendAfterSeconds: 60 }),
    login: async () => auth('SALE_STAFF')
  });
  fireEvent.change(await screen.findByRole('textbox', { name: 'Email' }), { target: { value: 'staff@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  fireEvent.change(await screen.findByLabelText('Mã OTP 6 chữ số'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }));
}

test('UC-94 signs Sale Staff into the dashboard and shows the three order counts and low-stock count', async () => {
  await signIn('/sign-in');
  expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  expect(screen.getByLabelText('Đường dẫn hiện tại')).toHaveTextContent(DASHBOARD);
  expect(screen.getByText('Việc cần làm ở cửa hàng. Bấm vào từng ô để mở danh sách.')).toBeVisible();
  const menu = screen.getByRole('navigation', { name: 'Điều hướng bán hàng' });
  expect(within(menu).getAllByRole('link').map(link => link.textContent)).toEqual(['Tổng quan', 'Bán tại quầy', 'Đơn hàng', 'Khiếu nại sản phẩm', 'Nhập hàng', 'Tồn kho']);
  for (const [label, key] of CARDS) {
    const card = await screen.findByRole('link', { name: new RegExp(label) });
    expect(within(card).getByText(String(COUNTS[key]))).toBeVisible();
    expect(within(card).getByText('Mở Đơn hàng')).toBeVisible();
  }
  const lowStockCard = await screen.findByRole('link', { name: /Sản phẩm sắp hết hàng/ });
  expect(within(lowStockCard).getByText(String(COUNTS.LOW_STOCK))).toBeVisible();
  expect(within(lowStockCard).getByText('Mở Tồn kho')).toBeVisible();
  expect(lowStockCard).toHaveAttribute('href', STOCK + '?tab=LOW_STOCK');
  const claimsCard = await screen.findByRole('link', { name: /Báo lỗi cần kiểm tra/ });
  expect(within(claimsCard).getByText(String(COUNTS.CLAIMS_TO_CHECK))).toBeVisible();
  expect(within(claimsCard).getByText('Mở Khiếu nại sản phẩm')).toBeVisible();
  expect(claimsCard).toHaveAttribute('href', '/admin/faulty-product-claims?tab=WAITING_CHECK');
});

test.each(CARDS)('UC-94 opens %s in the matching Order Management tab', async (label, key, tabLabel) => {
  open(DASHBOARD);
  fireEvent.click(await screen.findByRole('link', { name: new RegExp(label) }));
  expect(await screen.findByRole('button', { name: tabLabel + ' (' + COUNTS[key] + ')' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Đường dẫn hiện tại')).toHaveTextContent(ORDERS + '?tab=' + key);
});

test('UC-94 opens Sản phẩm sắp hết hàng in the Stock List Low Stock tab', async () => {
  open(DASHBOARD);
  fireEvent.click(await screen.findByRole('link', { name: /Sản phẩm sắp hết hàng/ }));
  expect(await screen.findByRole('button', { name: 'Sắp hết hàng (' + COUNTS.LOW_STOCK + ')' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Đường dẫn hiện tại')).toHaveTextContent(STOCK + '?tab=LOW_STOCK');
});

test('UC-94 preserves the requested order tab through sign-in', async () => {
  await signIn(ORDERS + '?tab=RETURNING');
  expect(await screen.findByRole('button', { name: 'Đang hoàn về (2)' })).toHaveAttribute('aria-pressed', 'true');
  expect(readDashboard).not.toHaveBeenCalled();
});

test.each([
  ['SALE_STAFF', '?tab=AWAITING_PICKUP', 'Chờ khách lấy (0)'],
  ['SALE_STAFF', '?tab=unknown', 'Cần chuẩn bị (3)'],
  ['ADMIN', '', 'Cần chuẩn bị (3)'],
  ['ADMIN', '?tab=RETURNING', 'Đang hoàn về (2)']
])('UC-94 opens Order Management directly for %s with query %s', async (role, query, expected) => {
  open(ORDERS + query, { resolve: async () => auth(role) });
  expect(await screen.findByRole('button', { name: expected })).toHaveAttribute('aria-pressed', 'true');
  expect(readDashboard).not.toHaveBeenCalled();
});

test('UC-94 updates the order tab URL without adding a history entry', async () => {
  open(ORDERS + '?tab=RETURNING&example=1');
  const prepare = await screen.findByRole('button', { name: 'Cần chuẩn bị (3)' });
  fireEvent.click(prepare);
  const location = screen.getByLabelText('Đường dẫn hiện tại');
  expect(location).toHaveTextContent(ORDERS + '?tab=PREPARE&example=1');
  expect(location).toHaveAttribute('data-navigation-type', 'REPLACE');
});

test.each([[503, 'SALES_DASHBOARD_SOURCE_UNAVAILABLE'], [404, 'RESOURCE_NOT_FOUND']])(
  'UC-94 shows loading and recovers after HTTP %s with retry', async (status, code) => {
    let finish;
    readDashboard.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    open(DASHBOARD);
    expect(await screen.findByRole('status', { name: 'Đang tải số đơn hàng' })).toBeVisible();
    await waitFor(() => expect(readDashboard).toHaveBeenCalledTimes(1));
    finish(response(status, { error: { code } }));
    const notice = await screen.findByRole('alert', { name: 'Không thể tải tổng quan' });
    expect(screen.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
    expect(screen.queryByText('Đơn cần chuẩn bị')).not.toBeInTheDocument();
    fireEvent.click(within(notice).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('link', { name: /Đơn cần chuẩn bị/ })).toBeVisible();
    expect(readDashboard).toHaveBeenCalledTimes(2);
  }
);
