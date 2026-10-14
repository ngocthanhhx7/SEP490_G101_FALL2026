import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomerUnpaidBookingsPage } from '../../src/pages/customer/CustomerUnpaidBookingsPage.jsx';

const booking = (overrides = {}) => ({
  id: 'booking-123', reference: 'PWC-2026-000123', originalVisitCount: 3,
  amountVnd: 600000, quoteVersion: 4, paymentState: 'UNPAID',
  ...overrides,
});

function apiWith(rows, extra = {}) {
  return {
    listUnpaidBookings: jest.fn().mockResolvedValue({
      data: rows, meta: { serverNow: '2026-10-14T05:00:00.000Z' },
    }),
    createPaymentIntent: jest.fn(),
    ...extra,
  };
}

test('shows multi-visit prepay amount and creates only a server payment intent', async () => {
  const api = apiWith([booking()], {
    createPaymentIntent: jest.fn().mockResolvedValue({ data: { checkoutUrl: 'https://pay.payos.vn/web/test' } }),
  });
  const openCheckout = jest.fn();
  render(<CustomerUnpaidBookingsPage api={api} openCheckout={openCheckout} />);
  expect(await screen.findByText('PWC-2026-000123')).toBeVisible();
  expect(screen.getByText(/cần thanh toán đủ trước khi được gửi yêu cầu/)).toBeVisible();
  expect(screen.getByText(value => value.includes('600.000'))).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Thanh toán qua payOS' }));
  await waitFor(() => expect(api.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
    bookingId: 'booking-123', quoteVersion: 4, idempotencyKey: expect.any(String),
  })));
  expect(openCheckout).toHaveBeenCalledWith('https://pay.payos.vn/web/test');
});

test('browser query success does not change unpaid state or make a payment command', async () => {
  const api = apiWith([booking()]);
  render(<CustomerUnpaidBookingsPage api={api} />);
  expect(await screen.findByText('PWC-2026-000123')).toBeVisible();
  expect(screen.getByText('Chưa thanh toán')).toBeVisible();
  expect(api.createPaymentIntent).not.toHaveBeenCalled();
});

test('shows server-reported paid and failed terminal states accurately', async () => {
  const api = apiWith([
    booking({ paymentState: 'PAID' }),
    booking({ id: 'booking-456', reference: 'PWC-2026-000456', paymentState: 'FAILED' }),
  ]);
  render(<CustomerUnpaidBookingsPage api={api} />);
  expect(await screen.findByText('PWC-2026-000123')).toBeVisible();
  expect(screen.getByText('Đã thanh toán')).toBeVisible();
  expect(screen.getByText('Thanh toán thất bại')).toBeVisible();
  expect(screen.getAllByRole('button', { name: /payOS/ }).every(button => button.disabled)).toBe(true);
  expect(api.createPaymentIntent).not.toHaveBeenCalled();
});

test('pending intent response does not redirect and tells customer to refresh server state', async () => {
  const api = apiWith([booking()], {
    createPaymentIntent: jest.fn().mockResolvedValue({ data: { id: 'intent-1' }, pending: true }),
  });
  render(<CustomerUnpaidBookingsPage api={api} openCheckout={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Thanh toán qua payOS' }));
  expect(await screen.findByText(/Chưa có xác nhận thanh toán/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Thanh toán qua payOS' })).toBeDisabled();
});

test('expired payment link is not opened and payment stays unavailable', async () => {
  const api = apiWith([booking({ paymentState: 'EXPIRED', expiresAt: '2020-01-01T00:00:00.000Z' })]);
  render(<CustomerUnpaidBookingsPage api={api} />);
  expect(await screen.findByText('Liên kết đã hết hạn')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Thanh toán qua payOS' })).toBeDisabled();
  expect(api.createPaymentIntent).not.toHaveBeenCalled();
});

test('uses the API server clock to evaluate payment-link expiry', async () => {
  const localClock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2031-01-01T00:00:00.000Z'));
  try {
    const api = apiWith([booking({ expiresAt: '2030-01-01T00:30:00.000Z' })], {
      listUnpaidBookings: jest.fn().mockResolvedValue({
        data: [booking({ expiresAt: '2030-01-01T00:30:00.000Z' })],
        meta: { serverNow: '2030-01-01T00:00:00.000Z' },
      }),
    });
    render(<CustomerUnpaidBookingsPage api={api} />);
    expect(await screen.findByText('PWC-2026-000123')).toBeVisible();
    expect(screen.getByRole('button', { name: /payOS/ })).toBeEnabled();
  } finally {
    localClock.mockRestore();
  }
});

test('fails closed if API server time is missing or not UTC', async () => {
  const api = apiWith([booking()], {
    listUnpaidBookings: jest.fn().mockResolvedValue({
      data: [booking()], meta: { serverNow: '2026-10-14T12:00:00+07:00' },
    }),
  });
  render(<CustomerUnpaidBookingsPage api={api} />);
  expect(await screen.findByText('PWC-2026-000123')).toBeVisible();
  expect(screen.getByText('API phải trả về meta.serverNow theo UTC. Tải lại trước khi tạo lệnh thanh toán.'))
    .toBeVisible();
  expect(screen.getByRole('button', { name: /payOS/ })).toBeDisabled();
});

test('does not offer prepayment for a single-visit postpay booking', async () => {
  const api = apiWith([booking({ originalVisitCount: 1 })]);
  render(<CustomerUnpaidBookingsPage api={api} />);
  expect(await screen.findByText('PWC-2026-000123')).toBeVisible();
  expect(screen.getByText(/API tạo bill và payment command đang chờ P01\/P34/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /payOS/ })).not.toBeInTheDocument();
  expect(api.createPaymentIntent).not.toHaveBeenCalled();
});

test('forbidden and empty API results render their own states', async () => {
  const forbiddenApi = apiWith([], { listUnpaidBookings: jest.fn().mockRejectedValue({ status: 403, code: 'FORBIDDEN' }) });
  const forbiddenView = render(<CustomerUnpaidBookingsPage api={forbiddenApi} />);
  expect(await screen.findByText('Máy chủ từ chối yêu cầu. Booking vẫn được bảo vệ theo tài khoản đăng nhập.')).toBeVisible();
  forbiddenView.unmount();
  render(<CustomerUnpaidBookingsPage api={apiWith([])} />);
  expect(await screen.findByText('Các booking đã trả hoặc chưa đến bước thanh toán không xuất hiện ở đây.')).toBeVisible();
});

test('missing route adapter stays pending instead of displaying fake unpaid data', async () => {
  render(<CustomerUnpaidBookingsPage />);
  expect(await screen.findByText('Danh sách booking sẽ xuất hiện khi API và phân quyền P01/P34 được tích hợp.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Thanh toán qua payOS' })).not.toBeInTheDocument();
});

test('invalid amount or untrusted checkout host cannot start a payment', async () => {
  const invalidData = apiWith([booking({ amountVnd: 0 })]);
  const invalidView = render(<CustomerUnpaidBookingsPage api={invalidData} />);
  expect(await screen.findByText('Máy chủ chưa trả về bản ghi phù hợp với hợp đồng thanh toán. Không thể mở thanh toán.')).toBeVisible();
  invalidView.unmount();

  const unsafeApi = apiWith([booking({ originalVisitCount: 2 })], {
    createPaymentIntent: jest.fn().mockResolvedValue({ data: { checkoutUrl: 'https://evil.example/pay' } }),
  });
  render(<CustomerUnpaidBookingsPage api={unsafeApi} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Thanh toán qua payOS' }));
  expect(await screen.findByText('Máy chủ chưa trả về liên kết payOS an toàn.')).toBeVisible();
});
