import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ProductCartProvider } from '../../src/contexts/ProductCartContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = jest.fn().mockRejectedValue(new Error('synthetic unavailable')); });
afterEach(() => { globalThis.fetch = originalFetch; });

function show(roles = ['CUSTOMER'], path = '/account/settings') {
  const api = { getCart: jest.fn().mockResolvedValue({ data: { lines: [], lineCount: 0 } }),
    listOrders: jest.fn().mockResolvedValue({ data: [] }),
    getOrder: jest.fn().mockRejectedValue(new Error('not owned')) };
  const adapter = { resolve: async () => roles ? { status: 'authenticated', user: { id: 'synthetic-customer', displayName: 'Synthetic', roles } } : { status: 'guest' } };
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={adapter}>
    <ProductCartProvider api={api}><AppRoutes /></ProductCartProvider>
  </SessionProvider></MemoryRouter>);
  return api;
}

test('Customer can open product history from account navigation and retain the active account menu', async () => {
  const api = show();
  const nav = await screen.findByRole('navigation', { name: 'Điều hướng khách hàng' });
  const link = within(nav).getByRole('link', { name: 'Đơn mua sản phẩm' });
  expect(link).toHaveAttribute('href', '/customer/product-orders');
  fireEvent.click(link);
  expect(await screen.findByRole('heading', { name: 'Đơn mua sản phẩm' })).toBeVisible();
  const activeNav = screen.getByRole('navigation', { name: 'Điều hướng khách hàng' });
  expect(within(activeNav).getByRole('link', { name: 'Đơn mua sản phẩm' })).toHaveAttribute('aria-current', 'page');
  expect(api.listOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  expect(within(activeNav).getByRole('link', { name: 'Đơn chăm sóc' })).toHaveAttribute('href', '/account/bookings');
});

test.each([['ADMIN'], ['STAFF'], ['PET_SITTER']])('operational role %s cannot load Customer product history', async role => {
  const api = show([role], '/customer/product-orders');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(api.listOrders).not.toHaveBeenCalled();
});

test('existing notification deep link retains its order query in the account workspace', async () => {
  const id = 'a'.repeat(24), api = show(['CUSTOMER'], `/customer/product-orders?order=${id}`);
  expect(await screen.findByRole('heading', { name: 'Đơn mua sản phẩm' })).toBeVisible();
  expect(api.getOrder).toHaveBeenCalledWith(id, expect.objectContaining({ signal: expect.any(Object) }));
  expect(await screen.findByText('Chưa mở được đơn hàng từ thông báo')).toBeVisible();
});
