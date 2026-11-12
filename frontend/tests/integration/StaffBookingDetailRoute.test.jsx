import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const originalFetch = globalThis.fetch, id = 'b'.repeat(24);
afterEach(() => { globalThis.fetch = originalFetch; });

function show(role, { status = 200, paymentMode = 'PREPAY' } = {}) {
  globalThis.fetch = jest.fn(async path => {
    if (path !== `/api/v1/staff/bookings/${id}`) throw new Error('Unexpected request');
    return { ok: status === 200, status, json: async () => status !== 200
      ? { error: { code: status === 403 ? 'FORBIDDEN' : 'RESOURCE_NOT_FOUND' } }
      : { meta: { schemaVersion: 1 }, data: { id, state: 'CONFIRMED', customerName: 'Trần Thị Lan', paymentMode,
        paymentState: paymentMode === 'PREPAY' ? 'PAID' : 'UNPAID',
        details: {
          consentAt: '2026-11-10T03:12:00Z',
          terms: [{ serviceName: 'Dắt chó đi dạo', startAt: '2026-11-02T17:00:00Z', endAt: '2026-11-02T17:30:00Z',
            petNames: ['Milo'], serviceAddress: 'Địa chỉ lúc đặt', areaName: 'Khu vực Thanh Xuân', requestedSitterName: 'Lê Văn Minh',
            careRequirements: ['Milo hay kéo dây'] }],
          visits: [{ id: 'first', startAt: '2026-11-02T17:00:00Z', endAt: '2026-11-02T17:30:00Z', sitterName: 'Lê Văn Minh', state: 'COMPLETED' },
            { id: 'next', startAt: '2026-11-12T00:00:00Z', endAt: '2026-11-12T00:30:00Z', state: 'SCHEDULED' }],
          price: { visitCount: 2, visitPricesVnd: [90000], discountVnd: 9000, totalVnd: 171000 }
        } } } };
  });
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: [role] } }) };
  render(<MemoryRouter initialEntries={[`/staff/bookings/${id}`]}><SessionProvider adapter={adapter}><AppRoutes /></SessionProvider></MemoryRouter>);
}

test.each(['STAFF', 'ADMIN'])('UC-27 / GBR-02 / GBR-20: %s sees read-only details and the complete visit table', async role => {
  show(role);
  expect(await screen.findByText('Trần Thị Lan')).toBeVisible();
  expect(screen.getByText('Đã xác nhận')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Thông tin lịch đặt' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Giá và thanh toán' })).toBeVisible();
  expect(screen.getByRole('heading', { name: /Các buổi chăm sóc/ })).toBeVisible();
  const table = within(screen.getByRole('table'));
  expect(table.getAllByRole('row')).toHaveLength(3);
  expect(table.getByRole('cell', { name: '03/11' })).toBeVisible();
  expect(table.getByRole('cell', { name: '12/11' })).toBeVisible();
  expect(screen.getByText('Báo cáo')).toBeVisible();
  expect(screen.getByText(/Đã thanh toán trước/)).toBeVisible();
  expect(screen.queryByText(/48 giờ|Hoá đơn/)).toBeNull();
  expect(screen.queryByRole('link', { name: /^(Xem|Xem cả .*buổi)$/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Đổi giờ|Hướng dẫn chăm sóc|Huỷ lịch đặt|Gửi khiếu nại|Tạo link thanh toán/ })).toBeNull();
});

test('UC-27 / GBR-17: only postpay displays the bill and 48-hour note', async () => {
  show('STAFF', { paymentMode: 'POSTPAY' });
  expect(await screen.findByText('Hoá đơn')).toBeVisible();
  expect(screen.getByText(/48 giờ/)).toBeVisible();
});

test.each([[403, 'Bạn không có quyền thực hiện yêu cầu này.'], [404, 'Không tìm thấy thông tin được yêu cầu.']])(
  'UC-27 / GBR-02: displays shared feedback for HTTP %s', async (status, message) => {
    show('STAFF', { status });
    expect(await screen.findByText(message)).toBeVisible();
  }
);

test('UC-27 / GBR-02: Pet Sitter cannot open or fetch Staff detail', async () => {
  show('PET_SITTER');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
