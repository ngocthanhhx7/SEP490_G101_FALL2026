import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';
const originalFetch = globalThis.fetch, id = 'a'.repeat(24);
afterEach(() => { globalThis.fetch = originalFetch; });
function show(role, booking = {}) {
  globalThis.fetch = jest.fn(async path => {
    if (path !== `/api/v1/checkout/bookings/${id}`) throw new Error('synthetic unavailable');
    return { ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data: { id, state: 'DISPATCH_PENDING', totalVnd: 120000,
      visits: [{ id: 'visit', serviceName: 'Chăm sóc Milo', petNames: ['Milo'], startAt: '2026-11-12T02:00:00Z', location: 'HOME' }], careShifts: [], scheduleProposals: [], ...booking } }) };
  });
  render(<MemoryRouter initialEntries={[`/account/bookings/${id}`]}><SessionProvider adapter={{ resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: [role] } }) }}><AppRoutes /></SessionProvider></MemoryRouter>);
}
test('dedicated account detail URL displays the saved order and link back to history', async () => {
  show('CUSTOMER');
  expect(await screen.findByRole('heading', { name: 'Chăm sóc Milo' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Chi tiết đơn chăm sóc' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Đơn chăm sóc', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Danh sách đơn chăm sóc' })).toHaveAttribute('href', '/account/bookings');
  expect(globalThis.fetch).toHaveBeenCalledWith(`/api/v1/checkout/bookings/${id}`, expect.objectContaining({ credentials: 'same-origin' }));
});
test('non-Customer cannot fetch an account order detail by direct URL', async () => {
  show('STAFF');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('UC-27 / GBR-17: Customer sees saved details and retains checkout actions', async () => {
  show('CUSTOMER', {
    state: 'AWAITING_PAYMENT', paymentMode: 'PREPAY', paymentState: 'UNPAID',
    paymentDeadlineAt: new Date(Date.now() + 60000).toISOString(),
    scheduleProposals: [{ id: 'proposal', state: 'PENDING_CUSTOMER_CONFIRMATION', expiresAt: new Date(Date.now() + 60000).toISOString() }],
    details: {
      consentAt: '2026-11-10T03:12:00Z',
      terms: [{ serviceName: 'Chăm sóc Milo', petNames: ['Milo'], careRequirements: [] }],
      visits: [],
      price: { visitCount: 1, visitPricesVnd: [120000], discountVnd: 0, totalVnd: 120000 }
    }
  });
  expect(await screen.findByRole('heading', { name: 'Thông tin lịch đặt' })).toBeVisible();
  expect(screen.getByText('Chính sách trách nhiệm')).toBeVisible();
  expect(screen.getByText(/Xác nhận đặt lịch lúc 10:12 ngày 10\/11\/2026/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tạo link thanh toán' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem đề xuất lịch chăm sóc' })).toHaveAttribute('href', '/account/schedule-proposals/proposal');
  expect(screen.getByRole('button', { name: 'Cập nhật trạng thái đơn' })).toBeVisible();
  expect(screen.queryByText('Hoá đơn')).toBeNull();
});
