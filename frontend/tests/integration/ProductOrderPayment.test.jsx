import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ProductCartProvider } from '../../src/contexts/ProductCartContext.jsx';
import { MyProductOrdersPage } from '../../src/pages/customer/MyProductOrdersPage.jsx';
import { ProductOrderManagementPage } from '../../src/pages/admin/ProductOrderManagementPage.jsx';

// UC-62 (payment in advance through payOS), GBR-36, GBR-37.
const customer = { id: 'synthetic-customer', roles: ['CUSTOMER'] };
const adapter = { resolve: async () => ({ status: 'authenticated', user: customer }) };
const soon = () => new Date(Date.now() + 30 * 60_000).toISOString();
const line = { productId: 'p1', productCode: 'SP-0014', productName: 'Thức ăn hạt', quantity: 2, unitPrice: 210000, lineTotal: 420000 };
const ID = 'a'.repeat(24);
const prepaid = (over = {}) => ({ id: ID, code: 'DH-0040', createdAt: '2026-11-24T03:00:00.000Z', receiveMethod: 'DELIVERY',
  paymentMethod: 'PREPAID', paid: false, status: 'PLACED', paymentDeadlineAt: soon(), trackingCode: null,
  deliveryAddress: { label: 'Nhà', location: '45 Láng Hạ', areaCode: 'DISTRICT_DONG_DA' },
  lines: [line], subtotal: 420000, shippingFee: 25000, total: 445000, ...over });
const PAY = 'Thanh toán qua payOS';

function showOrders(order, { path = '/customer/product-orders', createPaymentLink } = {}) {
  const api = { getCart: jest.fn().mockResolvedValue({ data: { lines: [], lineCount: 0 } }),
    listOrders: jest.fn().mockResolvedValue({ data: [order], meta: { page: { page: 1, limit: 20, total: 1, totalPages: 1 } } }),
    getOrder: jest.fn().mockResolvedValue({ data: order }),
    createPaymentLink: createPaymentLink ?? jest.fn().mockRejectedValue({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 }) };
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={adapter}><ProductCartProvider api={api}>
    <MyProductOrdersPage api={api} /></ProductCartProvider></SessionProvider></MemoryRouter>);
  return api;
}

describe('My Orders, payment in advance', () => {
  test('an unpaid prepaid order shows its deadline and a button to pay on payOS', async () => {
    const api = showOrders(prepaid());
    const button = await screen.findByRole('button', { name: PAY });
    expect(screen.getByText('Chờ thanh toán')).toBeVisible();
    expect(screen.getByText(/Thanh toán trước \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}\./)).toBeVisible();
    fireEvent.click(button);
    await waitFor(() => expect(api.createPaymentLink).toHaveBeenCalledWith(ID));
  });

  test('MSG33 when payOS cannot make the page: the order stays and the customer can try again', async () => {
    showOrders(prepaid());
    fireEvent.click(await screen.findByRole('button', { name: PAY }));
    expect(await screen.findByText('Chưa thể mở trang thanh toán lúc này. Vui lòng thử lại sau vài phút.')).toBeVisible();
    expect(screen.getByRole('button', { name: PAY })).toBeEnabled();
  });

  test('MSG32 when the customer comes back from payOS after cancelling, and the order can be paid again', async () => {
    showOrders(prepaid(), { path: `/customer/product-orders?order=${ID}&cancel=true&status=CANCELLED` });
    expect(await screen.findByText('Thanh toán chưa thành công. Vui lòng thử lại.')).toBeVisible();
    expect(screen.getByRole('button', { name: PAY })).toBeVisible();
  });

  test('a paid order has no pay button', async () => {
    showOrders(prepaid({ paid: true }));
    expect(await screen.findByText('Đã thanh toán')).toBeVisible();
    expect(screen.queryByRole('button', { name: PAY })).not.toBeInTheDocument();
  });

  test('a prepaid order cancelled at the deadline says so and offers no payment', async () => {
    showOrders(prepaid({ status: 'CANCELLED' }));
    expect(await screen.findByText('Đã huỷ vì quá hạn thanh toán')).toBeVisible();
    expect(screen.queryByRole('button', { name: PAY })).not.toBeInTheDocument();
  });

  test('a late unpaid order offers no pay button', async () => {
    showOrders(prepaid({ paymentDeadlineAt: new Date(Date.now() - 60_000).toISOString() }));
    expect(await screen.findByText('Chờ thanh toán')).toBeVisible();
    expect(screen.queryByRole('button', { name: PAY })).not.toBeInTheDocument();
  });
});

describe('Order Management, prepaid orders', () => {
  const admin = (over = {}) => ({ ...prepaid(over), customer: { id: 'u1', displayName: 'Hoàng Thị Mai', phone: '0912345678' } });
  function showAdmin(order) {
    const api = { listOrders: jest.fn().mockResolvedValue({ data: [order], meta: { counts: { PREPARE: 1, AWAITING_PICKUP: 0, IN_TRANSIT: 0, RETURNING: 0 } } }),
      handToCarrier: jest.fn(), markReady: jest.fn(), recordPayment: jest.fn(), handToCustomer: jest.fn() };
    render(<MemoryRouter><ProductOrderManagementPage api={api} /></MemoryRouter>);
    return api;
  }

  test('an unpaid prepaid delivery order cannot be handed to the carrier', async () => {
    showAdmin(admin());
    expect(await screen.findByText(/Chờ khách thanh toán/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Đã giao cho hãng vận chuyển' })).not.toBeInTheDocument();
  });

  test('an unpaid prepaid pick-up order cannot be marked ready', async () => {
    showAdmin(admin({ receiveMethod: 'PICKUP', deliveryAddress: null, shippingFee: 0, total: 420000 }));
    expect(await screen.findByText(/Chờ khách thanh toán/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Đánh dấu sẵn sàng' })).not.toBeInTheDocument();
  });

  test('a paid prepaid order is handed over at once, with no payment to take', async () => {
    showAdmin(admin({ paid: true }));
    expect(await screen.findByRole('button', { name: 'Đã giao cho hãng vận chuyển' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Đã thu tiền' })).not.toBeInTheDocument();
  });
});
