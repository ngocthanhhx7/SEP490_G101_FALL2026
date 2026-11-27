import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ReportFaultyProductDialog } from '../../src/components/product/ReportFaultyProductDialog.jsx';
import { FaultyProductClaimsPage } from '../../src/pages/admin/FaultyProductClaimsPage.jsx';
import { createFaultyProductClaimApi } from '../../src/services/faulty-product-claim-api.js';
import { StockHistoryPanel } from '../../src/components/product/StockHistoryPanel.jsx';

const { HTMLDialogElement } = window;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

const ORDER_ID = '66a111111111111111111111';
const PRODUCT_ID = '66a222222222222222222222';
const CLAIM_ID = '66a333333333333333333333';
const PHOTO_ID = 'a'.repeat(64);

function withRole(ui, roles, route = '/admin/faulty-product-claims') {
  return render(
    <SessionProvider adapter={{
      getCsrfToken: () => 'csrf-token',
      resolve: async () => ({
        status: 'authenticated',
        user: { id: '66a999999999999999999999', roles },
        csrfToken: 'csrf-token'
      })
    }}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/admin/faulty-product-claims" element={ui} />
          <Route path="/customer/product-orders" element={ui} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  );
}

test('ReportFaultyProductDialog blocks expired order with MSG61 and submits valid report with photo', async () => {
  const order = {
    id: ORDER_ID,
    code: 'DH-0001',
    status: 'DELIVERED',
    lines: [{ productId: PRODUCT_ID, productName: 'Hạt khô cao cấp', quantity: 2, unitPrice: 120000 }]
  };

  // Expired order -> MSG61
  const expiredApi = {
    getEligibility: jest.fn().mockResolvedValue({
      eligible: false,
      reason: 'CLAIM_DEADLINE_PASSED',
      deadlineDate: '10/11/2026'
    }),
    submitClaim: jest.fn()
  };
  const { unmount } = render(
    <ReportFaultyProductDialog open order={order} claimApi={expiredApi} imageApi={{ upload: jest.fn() }} onClose={() => {}} />
  );
  expect(await screen.findByText('Thời hạn báo lỗi của đơn này đã hết vào ngày 10/11/2026.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Gửi báo lỗi' })).not.toBeInTheDocument();
  unmount();

  // Eligible order -> upload photo & submit
  const claimApi = {
    getEligibility: jest.fn().mockResolvedValue({ eligible: true, deadlineDate: '30/11/2026' }),
    submitClaim: jest.fn().mockResolvedValue({ id: CLAIM_ID, code: 'KN-0001' })
  };
  const imageApi = { upload: jest.fn().mockResolvedValue({ id: PHOTO_ID, state: 'READY' }) };
  const onSubmitted = jest.fn();

  render(
    <ReportFaultyProductDialog open order={order} claimApi={claimApi} imageApi={imageApi} onClose={() => {}} onSubmitted={onSubmitted} />
  );
  expect(await screen.findByRole('button', { name: 'Gửi báo lỗi' })).toBeInTheDocument();
  // No changed-mind option
  expect(screen.queryByText(/đổi ý/i)).not.toBeInTheDocument();

  const fileInput = screen.getByLabelText('Ảnh sản phẩm');
  const file = new globalThis.File([new Uint8Array([0xff, 0xd8, 0xff])], 'faulty.jpg', { type: 'image/jpeg' });
  fireEvent.change(fileInput, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi báo lỗi' }));

  await waitFor(() => expect(claimApi.submitClaim).toHaveBeenCalledTimes(1));
  expect(onSubmitted).toHaveBeenCalledWith({ id: CLAIM_ID, code: 'KN-0001' });
});

test('FaultyProductClaimsPage enforces MSG107 for Sale Staff, MSG108/MSG109, and handles insufficient stock fallback to refund', async () => {
  const baseClaim = {
    id: CLAIM_ID,
    code: 'KN-0001',
    orderId: ORDER_ID,
    orderCode: 'DH-0001',
    orderDeliveredAt: '2026-11-25T03:00:00.000Z',
    reportPolicy: { version: 2, days: 7, deadlineAt: '2026-12-02T03:00:00.000Z' },
    customerName: 'Khách 01',
    customerPhone: '0912345678',
    productId: PRODUCT_ID,
    productCode: 'SP-001',
    productName: 'Hạt khô cao cấp',
    orderedQuantity: 2,
    unitPriceVnd: 120000,
    quantity: 2,
    refundEstimateVnd: 240000,
    problemType: 'FAULTY_PRODUCT',
    description: 'Rách bao bì',
    photoIds: [],
    status: 'WAITING_CHECK',
    version: 0,
    createdAt: '2026-11-26T04:00:00.000Z',
    productAvailable: 0,
    canSendExchange: false
  };

  // Sale Staff flow: empty inspection -> MSG107, then valid -> MSG108
  const saleApi = {
    listClaims: jest.fn().mockResolvedValue({
      items: [baseClaim],
      counts: { WAITING_CHECK: 1, WAITING_ADMIN: 0, DONE: 0 },
      page: 1,
      limit: 20,
      total: 1
    }),
    inspectClaim: jest.fn().mockResolvedValue({ ...baseClaim, status: 'WAITING_ADMIN', version: 1 }),
    readAdminPhoto: jest.fn()
  };
  const { unmount } = withRole(<FaultyProductClaimsPage api={saleApi} />, ['SALE_STAFF']);
  expect(await screen.findByRole('heading', { name: /KN-0001/ })).toBeInTheDocument();
  expect(screen.getByText(/02\/12\/2026.*7 ngày · Bản 2/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Admin duyệt' }));
  expect(await screen.findByText('Vui lòng ghi kết quả kiểm tra.')).toBeInTheDocument();
  expect(saleApi.inspectClaim).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Kết quả kiểm tra/i), { target: { value: 'Đúng sản phẩm bị rách' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Admin duyệt' }));
  await waitFor(() => expect(saleApi.inspectClaim).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Đã gửi khiếu nại cho Admin.')).toBeInTheDocument();
  unmount();

  // Admin flow on EXCHANGE_APPROVED without stock: Exchange sent button hidden, switch to refund available -> MSG109
  const adminApi = {
    listClaims: jest.fn().mockResolvedValue({
      items: [{ ...baseClaim, status: 'EXCHANGE_APPROVED', decision: 'EXCHANGE', version: 2, productAvailable: 0, canSendExchange: false }],
      counts: { WAITING_CHECK: 0, WAITING_ADMIN: 0, DONE: 1 },
      page: 1,
      limit: 20,
      total: 1
    }),
    decideClaim: jest.fn().mockResolvedValue({ ...baseClaim, status: 'REFUND_APPROVED', decision: 'REFUND', refundAmountVnd: 240000, version: 3 }),
    readAdminPhoto: jest.fn()
  };
  withRole(<FaultyProductClaimsPage api={adminApi} />, ['ADMIN'], '/admin/faulty-product-claims?tab=DONE');
  expect(await screen.findByText('Chờ gửi hàng đổi')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Đã gửi hàng đổi' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Chuyển sang duyệt hoàn tiền/i }));
  await waitFor(() => expect(adminApi.decideClaim).toHaveBeenCalledWith(CLAIM_ID, expect.objectContaining({ decision: 'REFUND' })));
  expect(await screen.findByText('Đã lưu quyết định. Khách đã được báo.')).toBeInTheDocument();
});

test('staff loads only the selected claim photo and can retry when private media is busy', async () => {
  globalThis.URL.createObjectURL = jest.fn(() => 'blob:claim-photo');
  globalThis.URL.revokeObjectURL = jest.fn();
  const claim = { id: CLAIM_ID, code: 'KN-0001', orderCode: 'DH-0001',
    productName: 'Hạt khô', status: 'WAITING_CHECK', photoIds: [PHOTO_ID, 'b'.repeat(64), 'c'.repeat(64)] };
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { code: 'MEDIA_BUSY' } }) })
    .mockResolvedValue({ ok: true, blob: async () => new globalThis.Blob(['synthetic'], { type: 'image/png' }) });
  const api = {
    listClaims: jest.fn().mockResolvedValue({ items: [claim], total: 1 }),
    readAdminPhoto: createFaultyProductClaimApi({ fetchImpl }).readAdminPhoto
  };
  const { unmount } = withRole(<FaultyProductClaimsPage api={api} />, ['SALE_STAFF']);
  await screen.findByRole('heading', { name: /KN-0001/ });
  expect(fetchImpl).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ảnh 2' }));
  expect(await screen.findByText('Dịch vụ ảnh đang bận.')).toBeVisible();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại ảnh' }));
  expect(await screen.findByRole('img', { name: 'Ảnh khiếu nại 2' })).toBeVisible();
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    expect.stringContaining('b'.repeat(64)), expect.stringContaining('b'.repeat(64))
  ]);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:claim-photo');
});

test('StockHistoryPanel renders FAULTY_EXCHANGE stock history line with claim code and negative delta', async () => {
  const product = { id: PRODUCT_ID, code: 'SP-001', name: 'Hạt khô cao cấp', stockOnHand: 3, quantityHeld: 1, available: 2 };
  const api = {
    readHistory: jest.fn().mockResolvedValue({
      product,
      items: [{
        id: CLAIM_ID,
        kind: 'FAULTY_EXCHANGE',
        referenceCode: 'KN-0001',
        occurredAt: '2026-11-27T04:00:00.000Z',
        recorderName: 'Sale Staff 01',
        quantityChange: -2
      }],
      nextCursor: null
    })
  };
  render(<StockHistoryPanel product={product} api={api} />);
  expect(await screen.findByText(/Đổi hàng lỗi · KN-0001/)).toBeInTheDocument();
  expect(screen.getByText('Sale Staff 01')).toBeInTheDocument();
});
