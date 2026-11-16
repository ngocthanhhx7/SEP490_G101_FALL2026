import { fireEvent, render, screen } from '@testing-library/react';
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

test('AC-08 checkout shows MSG60 and prevents submission above L', async () => {
  const api = show({ ...cart, prepaidOnly: true });
  const button = await screen.findByRole('button', { name: 'Đặt hàng' });
  expect(button).toBeDisabled();
  expect(screen.getByText('Đơn hàng này chỉ có thể thanh toán trước.')).toBeVisible();
  expect(screen.queryByText('Thanh toán khi nhận hàng')).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(api.placeOrder).not.toHaveBeenCalled();
});

test('AC-08 checkout locks after the server rejects an order on updated refusal data', async () => {
  const api = show(cart, {
    placeOrder: jest.fn().mockRejectedValue({ code: 'PRODUCT_ORDER_PREPAY_REQUIRED', status: 409 }),
    getCart: jest.fn().mockResolvedValueOnce({ data: cart }).mockResolvedValueOnce({ data: cart })
      .mockResolvedValue({ data: { ...cart, prepaidOnly: true } })
  });
  await screen.findByRole('option', { name: 'Nhà' });
  fireEvent.click(await screen.findByRole('button', { name: 'Đặt hàng' }));
  expect(await screen.findByText('Đơn hàng này chỉ có thể thanh toán trước.')).toBeVisible();
  expect(api.placeOrder).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Đặt hàng' })).toBeDisabled();
});
