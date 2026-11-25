import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { RefundProcessingPage } from '../../src/pages/admin/RefundProcessingPage.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const bookingId = 'b'.repeat(24);
const pendingItem = {
  id: 'case-100',
  code: 'KN-100000000001',
  kind: 'COMPLAINT',
  state: 'OPEN',
  scope: 'VISIT',
  version: 1,
  bookingId,
  customer: { displayName: 'Trần Thị Lan', phone: '0912345678' },
  booking: { id: bookingId, code: 'BK-0099', serviceName: 'Chăm sóc tại nhà' },
  evidenceRefs: [],
  proposal: {
    status: 'PENDING',
    amountVnd: 150000,
    reason: 'Thú cưng chưa được chải lông đầy đủ.',
    createdAt: '2026-11-24T03:00:00Z',
    createdByName: 'Nguyễn Staff',
    evidenceRefs: []
  },
  billing: {
    status: 'AVAILABLE',
    basis: 'ISSUED',
    basisAmountVnd: 300000,
    approvedTotalVnd: 50000,
    remainingVnd: 250000,
    paidInFull: true
  }
};

const session = role => ({
  getCsrfToken: () => 'synthetic-csrf',
  resolve: async () => ({ status: 'authenticated', user: { id: 'admin-1', roles: [role] } })
});

function createApi(detail = pendingItem) {
  return {
    refundProposals: jest.fn(async ({ status } = {}) => ({
      data: {
        items: status === 'DECIDED' ? [] : [pendingItem],
        proposalCounts: { PENDING: 1, DECIDED: 0 },
        nextCursor: null
      }
    })),
    refundProposal: jest.fn(async () => ({ data: detail })),
    decideRefund: jest.fn(async () => ({
      data: {
        state: 'RESOLVED',
        messageCode: 'MSG134',
        complaint: { ...detail, state: 'RESOLVED', version: 2, moneyDecision: { outcome: 'APPROVE', amountVnd: 150000 } }
      }
    }))
  };
}

function show(api, path = '/admin/refunds') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider adapter={session('ADMIN')}>
        <RefundProcessingPage api={api} />
      </SessionProvider>
    </MemoryRouter>
  );
}

test('UC-51 ST-CAS-10 shows proposal tabs, billing breakdown, approves and lowers amount with MSG134 and blocks over cap (MSG44)', async () => {
  const api = createApi();
  show(api);

  expect(await screen.findByRole('heading', { name: 'Hoàn tiền' })).toBeVisible();
  expect(await screen.findByRole('tab', { name: 'Chờ duyệt (1)' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Đã quyết (0)' })).toBeVisible();
  expect(await screen.findByRole('heading', { name: pendingItem.code })).toBeVisible();
  expect(screen.getByText(/^300\.000\s*₫$/)).toBeVisible();
  expect(screen.getByText(/^50\.000\s*₫$/)).toBeVisible();
  expect(screen.getByText(/^250\.000\s*₫$/)).toBeVisible();
  expect(screen.getByText(/Nguyễn Staff/)).toBeVisible();
  expect(screen.getByText(/kế toán Paw World chi trả ngoài hệ thống/)).toBeVisible();

  // Over proposed amount blocked
  const amountInput = screen.getByLabelText(/Số tiền duyệt/);
  fireEvent.change(amountInput, { target: { value: '160000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
  expect(screen.getByText(/không được vượt quá số tiền nhân viên đề xuất/)).toBeVisible();
  expect(api.decideRefund).not.toHaveBeenCalled();

  // Lower amount to 120,000 -> sends REDUCE and shows MSG134
  fireEvent.change(amountInput, { target: { value: '120000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
  expect(await screen.findByText(/Đã duyệt số tiền hoàn/)).toBeVisible();
  expect(api.decideRefund).toHaveBeenCalledWith(expect.objectContaining({
    complaintId: pendingItem.id,
    expectedVersion: 1,
    outcome: 'REDUCE',
    amountVnd: 120000
  }));
});

test('UC-51 ST-CAS-10 rejects proposal requiring reason (MSG01) and shows MSG135 on success', async () => {
  const api = createApi();
  api.decideRefund.mockResolvedValue({
    data: {
      state: 'RESOLVED',
      messageCode: 'MSG135',
      complaint: { ...pendingItem, state: 'RESOLVED', version: 2, moneyDecision: { outcome: 'REJECT', amountVnd: null, reason: 'Không hợp lệ.' } }
    }
  });
  show(api);
  expect(await screen.findByRole('heading', { name: pendingItem.code })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
  expect(screen.getByText('Trường này là bắt buộc.')).toBeVisible();
  expect(api.decideRefund).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'Không đủ cơ sở hoàn tiền.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
  expect(await screen.findByText(/Đã từ chối đề xuất hoàn tiền/)).toBeVisible();
  expect(api.decideRefund).toHaveBeenCalledWith(expect.objectContaining({
    complaintId: pendingItem.id,
    expectedVersion: 1,
    outcome: 'REJECT',
    reason: 'Không đủ cơ sở hoàn tiền.'
  }));
});

test('UC-51 exposes Hoàn tiền in Admin menu at /admin/refunds and blocks Staff', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({
    status: 200, ok: true,
    json: async () => ({ data: { items: [], proposalCounts: { PENDING: 0, DECIDED: 0 }, nextCursor: null } })
  }));
  try {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/refunds']}>
        <SessionProvider adapter={session('ADMIN')}>
          <AppRoutes />
        </SessionProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'Hoàn tiền' })).toHaveAttribute('href', '/admin/refunds');
    expect(await screen.findByRole('heading', { name: 'Hoàn tiền' })).toBeVisible();
    unmount();

    render(
      <MemoryRouter initialEntries={['/admin/refunds']}>
        <SessionProvider adapter={session('STAFF')}>
          <AppRoutes />
        </SessionProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UC-39 ST-BKG-30 shows Hoàn tiền lịch đặt tab with recorded booking cancellation refunds', async () => {
  const api = {
    ...createApi(),
    bookingRefunds: jest.fn(async () => ({
      data: {
        total: 1,
        items: [{
          id: 'cancel:' + '1'.repeat(24),
          bookingId,
          visitId: '1'.repeat(24),
          sourceType: 'BOOKING_CANCELLATION',
          state: 'RECORDED',
          amountVnd: 114000,
          lateFeeVnd: 0,
          comboDiscountAdjustmentVnd: 2400,
          reason: 'Thay đổi kế hoạch',
          recordedAt: '2026-11-26T02:05:00.000Z',
          customer: { id: 'cust-1', displayName: 'Trần Thị Lan' },
          booking: { id: bookingId, state: 'DISPATCH_PENDING', serviceName: 'Chăm sóc tại gia', paidTotalVnd: 349200 },
          visit: { id: '1'.repeat(24), startAt: '2026-11-28T02:00:00.000Z', endAt: '2026-11-28T03:00:00.000Z', state: 'CANCELLED' }
        }]
      }
    }))
  };
  show(api);

  fireEvent.click(await screen.findByRole('tab', { name: /Hoàn tiền lịch đặt/ }));
  expect(await screen.findByRole('heading', { name: 'Chăm sóc tại gia' })).toBeVisible();
  expect(screen.getByText(/^114\.000\s*₫$/)).toBeVisible();
  expect(screen.getByText(/2\.400/)).toBeVisible();
  expect(screen.getByText('Thay đổi kế hoạch')).toBeVisible();
  expect(api.bookingRefunds).toHaveBeenCalledTimes(1);
});

test('ST-ORD-10 shows Hoàn tiền đơn hàng tab using productSalesApi.listOrderRefunds', async () => {
  const api = createApi();
  const productSalesApi = {
    listOrderRefunds: jest.fn(async () => ({
      data: {
        total: 1,
        items: [{
          id: 'c'.repeat(24),
          code: 'DH-2026-0099',
          status: 'CANCELLED',
          receiveMethod: 'DELIVERY',
          paymentMethod: 'PREPAID',
          paid: true,
          subtotal: 150000,
          shippingFee: 25000,
          total: 175000,
          refundMarked: true,
          refundAmountVnd: 175000,
          cancelledAt: '2026-11-26T02:10:00.000Z',
          customer: { id: 'cust-1', displayName: 'Trần Thị Lan', phone: '0912345678' },
          lines: []
        }]
      }
    }))
  };

  render(
    <MemoryRouter initialEntries={['/admin/refunds']}>
      <SessionProvider adapter={session('ADMIN')}>
        <RefundProcessingPage api={api} productSalesApi={productSalesApi} />
      </SessionProvider>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole('tab', { name: /Hoàn tiền đơn hàng/ }));
  expect(await screen.findByRole('heading', { name: 'Đơn DH-2026-0099' })).toBeVisible();
  expect(screen.getAllByText(/175\.000\s*₫/).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Đã huỷ')).toBeVisible();
  expect(productSalesApi.listOrderRefunds).toHaveBeenCalledTimes(1);
});
