import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ProductCartProvider } from '../../src/contexts/ProductCartContext.jsx';
import { MyProductOrdersPage } from '../../src/pages/customer/MyProductOrdersPage.jsx';

if (!window.HTMLDialogElement.prototype.showModal) {
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
}
if (!window.HTMLDialogElement.prototype.close) {
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
}

const placedCod = {
  id: 'a'.repeat(24),
  code: 'DH-2026-0001',
  createdAt: '2026-11-26T02:00:00.000Z',
  receiveMethod: 'DELIVERY',
  paymentMethod: 'COD',
  paid: false,
  paymentDeadlineAt: null,
  paidAt: null,
  status: 'PLACED',
  cancelledAt: null,
  cancelledBy: null,
  refundMarked: false,
  refundAmountVnd: null,
  version: 0,
  trackingCode: null,
  deliveryAddress: { label: 'Nhà', location: 'Cầu Giấy, Hà Nội', areaCode: 'cau-giay' },
  lines: [{ productId: 'p1', productCode: 'SP-001', productName: 'Thức ăn chó', quantity: 2, unitPrice: 50000, unitDiscount: 0, lineTotal: 100000 }],
  subtotal: 100000,
  tierDiscount: 0,
  tierCode: null,
  tierPolicyVersion: null,
  shippingFee: 25000,
  total: 125000
};

const handedOrder = {
  ...placedCod,
  id: 'b'.repeat(24),
  code: 'DH-2026-0002',
  status: 'HANDED_TO_CARRIER',
  trackingCode: 'VN-999'
};

const readyPickupOrder = {
  ...placedCod,
  id: 'd'.repeat(24),
  code: 'DH-2026-0004',
  receiveMethod: 'PICKUP',
  paymentMethod: 'PAY_AT_SHOP',
  deliveryAddress: null,
  shippingFee: 0,
  total: 100000,
  status: 'READY'
};

const deliveredOrder = {
  ...placedCod,
  id: 'e'.repeat(24),
  code: 'DH-2026-0005',
  status: 'DELIVERED',
  paid: true
};

const unpaidPrepaidCancelledByCustomer = {
  ...placedCod,
  id: 'c'.repeat(24),
  code: 'DH-2026-0003',
  paymentMethod: 'PREPAID',
  paid: false,
  status: 'CANCELLED',
  cancelledBy: 'CUSTOMER',
  cancelledAt: '2026-11-26T02:05:00.000Z'
};

function show(api) {
  const fullApi = { getCart: jest.fn().mockResolvedValue({ data: { lines: [], lineCount: 0 } }), ...api };
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'cust-1', displayName: 'Khách', roles: ['CUSTOMER'] } }) };
  return render(
    <MemoryRouter initialEntries={['/customer/product-orders']}>
      <SessionProvider adapter={adapter}>
        <ProductCartProvider api={fullApi}>
          <MyProductOrdersPage />
        </ProductCartProvider>
      </SessionProvider>
    </MemoryRouter>
  );
}

test('ST-ORD-10 shows Cancel button only for PLACED, asks MSG154, cancels with MSG155, shows MSG156 for HANDED_TO_CARRIER/READY only', async () => {
  let current = [placedCod, handedOrder, readyPickupOrder, deliveredOrder];
  const api = {
    listOrders: jest.fn(async () => ({ data: current, meta: { page: { page: 1, limit: 20, total: current.length } } })),
    getOrder: jest.fn(async () => ({ data: current[0] })),
    cancelOrder: jest.fn(async () => {
      const updated = { ...placedCod, status: 'CANCELLED', cancelledBy: 'CUSTOMER', version: 1 };
      current = [updated, handedOrder, readyPickupOrder, deliveredOrder];
      return updated;
    })
  };

  show(api);
  expect(await screen.findByRole('heading', { name: /DH-2026-0001/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }));
  expect(await screen.findByText(/Huỷ đơn hàng DH-2026-0001\? Nếu bạn đã thanh toán, Paw World sẽ hoàn đủ số tiền\./)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }));
  await waitFor(() => expect(api.cancelOrder).toHaveBeenCalledWith(placedCod.id, expect.objectContaining({ idempotencyKey: expect.any(String) })));
  expect(await screen.findByText('Đơn hàng DH-2026-0001 đã được huỷ.')).toBeVisible();
  expect(screen.queryByText('Đơn này không thể huỷ nữa.')).not.toBeInTheDocument();

  // Select HANDED_TO_CARRIER order -> no Cancel button, shows MSG156 inline
  fireEvent.click(screen.getByRole('button', { name: 'Xem đơn DH-2026-0002' }));
  expect(await screen.findByRole('heading', { name: /DH-2026-0002/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument();
  expect(screen.getByText('Đơn này không thể huỷ nữa.')).toBeVisible();

  // Select READY pickup order -> no Cancel button, shows MSG156 inline
  fireEvent.click(screen.getByRole('button', { name: 'Xem đơn DH-2026-0004' }));
  expect(await screen.findByRole('heading', { name: /DH-2026-0004/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument();
  expect(screen.getByText('Đơn này không thể huỷ nữa.')).toBeVisible();

  // Select DELIVERED order -> neither Cancel button nor MSG156
  fireEvent.click(screen.getByRole('button', { name: 'Xem đơn DH-2026-0005' }));
  expect(await screen.findByRole('heading', { name: /DH-2026-0005/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument();
  expect(screen.queryByText('Đơn này không thể huỷ nữa.')).not.toBeInTheDocument();
});

test('ST-ORD-10 shows MSG156 inline and reloads when order was handed to carrier concurrently', async () => {
  let orders = [placedCod];
  const api = {
    listOrders: jest.fn(async () => ({ data: orders, meta: { page: { page: 1, limit: 20, total: orders.length } } })),
    getOrder: jest.fn(async () => ({ data: orders[0] })),
    cancelOrder: jest.fn(async () => {
      orders = [{ ...placedCod, status: 'HANDED_TO_CARRIER', trackingCode: 'GHN-123' }];
      const error = new Error('cannot cancel');
      error.code = 'ORDER_NOT_CANCELLABLE';
      throw error;
    })
  };

  show(api);
  expect(await screen.findByRole('button', { name: 'Huỷ đơn' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Huỷ đơn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận huỷ' }));
  expect(await screen.findByText('Đơn này không thể huỷ nữa.')).toBeVisible();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Huỷ đơn' })).not.toBeInTheDocument());
});

test('Customer-cancelled unpaid prepaid order does not show payment-expired label or MSG156', async () => {
  const api = {
    listOrders: jest.fn(async () => ({ data: [unpaidPrepaidCancelledByCustomer], meta: { page: { page: 1, limit: 20, total: 1 } } })),
    getOrder: jest.fn(async () => ({ data: unpaidPrepaidCancelledByCustomer })),
    cancelOrder: jest.fn()
  };

  show(api);
  expect(await screen.findByText('Đã huỷ (chưa thanh toán)')).toBeVisible();
  expect(screen.queryByText('Đã huỷ vì quá hạn thanh toán')).not.toBeInTheDocument();
  expect(screen.queryByText('Đơn này không thể huỷ nữa.')).not.toBeInTheDocument();
});
