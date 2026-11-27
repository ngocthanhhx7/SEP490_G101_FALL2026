import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ProductCartProvider } from '../../src/contexts/ProductCartContext.jsx';
import { ProductCheckoutPage } from '../../src/pages/customer/ProductCheckoutPage.jsx';

const customer = { id: 'synthetic-customer', roles: ['CUSTOMER'] };
const adapter = { resolve: async () => ({ status: 'authenticated', user: customer }) };
const cart = {
  lines: [{ productId: 'p1', name: 'Thức ăn hạt', code: 'SP-0012', unitPrice: 250000,
    lineTotal: 500000,
    quantity: 2, purchasable: true, available: 5 }],
  lineCount: 1, subtotal: 500000, total: 500000,
  deliveryFee: 25000, hasUnavailable: false, prepaidOnly: false
};

function show(cartView, overrides = {}) {
  const api = {
    getCart: jest.fn().mockResolvedValue({ data: cartView }),
    addresses: jest.fn().mockResolvedValue({ data: [{ id: 'synthetic-address', label: 'Nhà' }] }),
    placeOrder: jest.fn(),
    ...overrides
  };
  render(<MemoryRouter><SessionProvider adapter={adapter}><ProductCartProvider api={api}><ProductCheckoutPage />
  </ProductCartProvider></SessionProvider></MemoryRouter>);
  return api;
}

const placedOrder = { id: 'o1', code: 'DH-0001', receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', paid: false, status: 'PLACED',
  lines: [], subtotal: 500000, shippingFee: 25000, total: 525000 };
const payos = 'Thanh toán trước qua payOS';

test('ST-ORD-02 a delivery offers payOS in advance or cash on delivery, and sends the one chosen', async () => {
  const api = show(cart, { placeOrder: jest.fn().mockResolvedValue(placedOrder),
    createPaymentLink: jest.fn().mockRejectedValue({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 }) });
  fireEvent.change(await screen.findByLabelText('Địa chỉ nhận hàng'), { target: { value: 'synthetic-address' } });
  expect(screen.getByLabelText(new RegExp(payos))).not.toBeChecked();
  expect(screen.getByLabelText(/Thanh toán khi nhận hàng/)).toBeChecked();
  fireEvent.click(screen.getByLabelText(new RegExp(payos)));
  fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
  await waitFor(() => expect(api.createPaymentLink).toHaveBeenCalledWith('o1'));
  expect(api.placeOrder).toHaveBeenCalledWith({ receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', addressId: 'synthetic-address' },
    expect.any(String));
});

test('ST-ORD-07 a pick-up offers payOS in advance or payment at the shop', async () => {
  show(cart);
  fireEvent.click(await screen.findByLabelText(/Nhận tại cửa hàng/));
  expect(screen.getByLabelText(new RegExp(payos))).toBeVisible();
  expect(screen.getByLabelText(/Trả tại cửa hàng/)).toBeChecked();
  expect(screen.queryByLabelText(/Thanh toán khi nhận hàng/)).not.toBeInTheDocument();
});

test('MSG33 the order stays placed and the customer goes to My Orders when the payOS page cannot be made', async () => {
  const api = show(cart, { placeOrder: jest.fn().mockResolvedValue(placedOrder),
    createPaymentLink: jest.fn().mockRejectedValue({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 }) });
  fireEvent.click(await screen.findByLabelText(/Nhận tại cửa hàng/));
  fireEvent.click(screen.getByLabelText(new RegExp(payos)));
  fireEvent.click(screen.getByRole('button', { name: 'Đặt hàng' }));
  await waitFor(() => expect(api.createPaymentLink).toHaveBeenCalledTimes(1));
  expect(api.placeOrder).toHaveBeenCalledTimes(1);
});

test('ST-ORD-13 a customer over the refusal limit sees MSG60 and only payOS, and can still order', async () => {
  const api = show({ ...cart, prepaidOnly: true }, { placeOrder: jest.fn().mockResolvedValue(placedOrder),
    createPaymentLink: jest.fn().mockRejectedValue({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', status: 503 }) });
  const button = await screen.findByRole('button', { name: 'Đặt hàng' });
  expect(button).toBeEnabled();
  expect(screen.getByText('Đơn hàng này chỉ có thể thanh toán trước.')).toBeVisible();
  expect(screen.getByLabelText(new RegExp(payos))).toBeChecked();
  expect(screen.queryByLabelText(/Thanh toán khi nhận hàng/)).not.toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText('Địa chỉ nhận hàng'), { target: { value: 'synthetic-address' } });
  fireEvent.click(button);
  await waitFor(() => expect(api.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'PREPAID' }), expect.any(String)));
});

test('AC-08 when the server says only payment in advance is allowed, MSG60 shows and payOS is the only way left', async () => {
  const api = show(cart, {
    placeOrder: jest.fn().mockRejectedValue({ code: 'PRODUCT_ORDER_PREPAY_REQUIRED', status: 409 }),
    getCart: jest.fn().mockResolvedValueOnce({ data: cart }).mockResolvedValueOnce({ data: cart })
      .mockResolvedValue({ data: { ...cart, prepaidOnly: true } })
  });
  await screen.findByRole('option', { name: 'Nhà' });
  fireEvent.click(await screen.findByRole('button', { name: 'Đặt hàng' }));
  expect(await screen.findByText('Đơn hàng này chỉ có thể thanh toán trước.')).toBeVisible();
  expect(api.placeOrder).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText(/Thanh toán khi nhận hàng/)).not.toBeInTheDocument();
  expect(screen.getByLabelText(new RegExp(payos))).toBeChecked();
});
