import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';
import { ProductCartProvider, useProductCart } from '../../src/contexts/ProductCartContext.jsx';
import { HomePage } from '../../src/pages/public/HomePage.jsx';

test('Home switches the same section between services and products without fetching products initially', async () => {
  const productApi = { listProducts: jest.fn().mockResolvedValue({ data: [{ id: 'p1', name: 'Kit Mèo Con Osmon Gà Non', category: 'FOOD', petType: 'CAT',
    sellingPrice: 220000, available: 36, inStock: true, photos: ['/assets/products/osmon-podium.webp'] }] }) };
  render(<MemoryRouter><HomePage loadCatalog={async () => ({ data: { available: false } })} productApi={productApi} /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Dịch vụ có sẵn' })).toBeVisible();
  expect(productApi.listProducts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sản phẩm', exact: true }));
  expect(await screen.findByRole('heading', { name: 'Kit Mèo Con Osmon Gà Non' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem tất cả sản phẩm' })).toHaveAttribute('href', '/products');
  expect(screen.getByRole('button', { name: 'Sản phẩm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Dịch vụ', exact: true }));
  expect(screen.getByRole('heading', { name: 'Dịch vụ có sẵn' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Kit Mèo Con Osmon Gà Non' })).not.toBeInTheDocument();
});

test('a completed mutation cannot restore private cart state after session invalidation', async () => {
  let resolveAdd;
  const api = { getCart: jest.fn().mockResolvedValue({ data: { lineCount: 0 } }), addToCart: jest.fn(() => new Promise(resolve => { resolveAdd = resolve; })) };
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'customer-A', roles: ['CUSTOMER'] } }) };
  function Probe() {
    const session = useSession(), cart = useProductCart();
    return <><output data-testid="cart">{session.status}|{cart.lineCount}|{cart.cart?.privateMarker ?? ''}</output>
      <button onClick={() => cart.addLine('p1', 1)}>Add</button><button onClick={session.invalidate}>Invalidate</button></>;
  }
  render(<SessionProvider adapter={adapter}><ProductCartProvider api={api}><Probe /></ProductCartProvider></SessionProvider>);
  await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('authenticated|0|'));
  fireEvent.click(screen.getByText('Add'));
  await waitFor(() => expect(api.addToCart).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('Invalidate'));
  await waitFor(() => expect(screen.getByTestId('cart')).toHaveTextContent('guest|0|'));
  await act(async () => { resolveAdd({ lineCount: 7, privateMarker: 'old-private-cart' }); });
  expect(screen.getByTestId('cart')).toHaveTextContent('guest|0|');
  expect(screen.getByTestId('cart')).not.toHaveTextContent('old-private-cart');
});

test('cart writes are serialized and queued writes cannot run under a later session', async () => {
  let finishFirst;
  const api = { getCart: jest.fn().mockResolvedValue({ data: { lineCount: 0 } }),
    addToCart: jest.fn(() => new Promise(resolve => { finishFirst = resolve; })) };
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'customer-A', roles: ['CUSTOMER'] } }) };
  function Probe() {
    const cart = useProductCart(), session = useSession();
    return <><output>{session.status}</output><button onClick={() => cart.addLine('one', 1).catch(() => {})}>One</button>
      <button onClick={() => cart.addLine('two', 1).catch(() => {})}>Two</button><button onClick={session.invalidate}>Exit</button></>;
  }
  render(<SessionProvider adapter={adapter}><ProductCartProvider api={api}><Probe /></ProductCartProvider></SessionProvider>);
  await screen.findByText('authenticated');
  fireEvent.click(screen.getByText('One')); await waitFor(() => expect(api.addToCart).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('Two')); expect(api.addToCart).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Exit')); await screen.findByText('guest');
  await act(async () => finishFirst({ lineCount: 1 }));
  expect(api.addToCart).toHaveBeenCalledTimes(1);
});
