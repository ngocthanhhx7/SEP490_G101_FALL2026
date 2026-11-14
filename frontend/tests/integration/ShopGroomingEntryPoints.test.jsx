import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ServiceBookingPage } from '../../src/pages/public/ServiceBookingPage.jsx';
import { ServiceDetailsPage } from '../../src/pages/public/ServiceDetailsPage.jsx';
import { ServiceListPage } from '../../src/pages/public/ServiceListPage.jsx';

jest.mock('../../src/styles/public-pages.css', () => ({}), { virtual: true });

const guest = { resolve: async () => ({ status: 'guest' }) };
// A guest session makes no booking requests; the pages only need a fetch to exist when they build their clients.
globalThis.fetch = jest.fn(async () => { throw new Error('no network in this test'); });
const base = { species: ['DOG', 'CAT'], price: { amountVnd: 100000, currency: 'VND', unitLabel: 'mỗi lượt' }, policy: { version: 1, title: 'Chính sách', body: 'Nội dung', effectiveAt: '2026-10-01T00:00:00.000Z' } };
const services = [
  { ...base, id: 'bath-1', name: 'Tắm và vệ sinh thú cưng', description: 'Tắm tại cửa hàng.', scope: 'Tại cửa hàng.', details: { category: 'Vệ sinh', locations: ['FACILITY'], durationMinutes: 60 } },
  { ...base, id: 'nail-2', name: 'Cắt móng', description: 'Cắt móng tại cửa hàng hoặc tại nhà.', scope: 'Cả hai.', details: { category: 'Vệ sinh', locations: ['FACILITY', 'HOME'], durationMinutes: 15 } },
  { ...base, id: 'walk-3', name: 'Dắt chó đi dạo', description: 'Dắt chó.', scope: 'Tại nhà.', details: { category: 'Chăm sóc', locations: ['HOME'], durationMinutes: 60 } }
];
const loadCatalog = () => Promise.resolve({ data: { available: true, services } });

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider adapter={guest}>
        <Routes>
          <Route path="/services" element={<ServiceListPage loadCatalog={loadCatalog} />} />
          <Route path="/services/:serviceId" element={<ServiceDetailsPage loadCatalog={loadCatalog} />} />
          <Route path="/booking/:serviceId" element={<ServiceBookingPage loadCatalog={loadCatalog} />} />
          <Route path="/grooming-booking" element={<main><h1>Trang đặt lịch cửa hàng</h1></main>} />
        </Routes>
        <Where />
      </SessionProvider>
    </MemoryRouter>
  );
}

describe('Service Details', () => {
  test('a shop-only service (Tắm) has the shop button alone', async () => {
    renderAt('/services/bath-1');
    expect(await screen.findByRole('heading', { name: 'Tắm và vệ sinh thú cưng' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Đặt lịch tại cửa hàng' })).toHaveAttribute('href', '/grooming-booking?serviceId=bath-1');
    expect(screen.queryByRole('link', { name: 'Đặt tại nhà' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đặt dịch vụ này' })).not.toBeInTheDocument();
  });

  test('a service at the shop and at home (Cắt móng) has two buttons with different destinations', async () => {
    renderAt('/services/nail-2');
    await screen.findByRole('heading', { name: 'Cắt móng' });
    const shop = screen.getByRole('link', { name: 'Đặt lịch tại cửa hàng' });
    const home = screen.getByRole('link', { name: 'Đặt tại nhà' });
    expect(shop).toHaveAttribute('href', '/grooming-booking?serviceId=nail-2');
    expect(home).toHaveAttribute('href', '/booking/nail-2');
    expect(shop.getAttribute('href')).not.toBe(home.getAttribute('href'));
    expect(screen.queryByRole('link', { name: 'Đặt dịch vụ này' })).not.toBeInTheDocument();
  });

  test('a service that is not shop grooming keeps the label "Đặt dịch vụ này" and its destination', async () => {
    renderAt('/services/walk-3');
    await screen.findByRole('heading', { name: 'Dắt chó đi dạo' });
    expect(screen.getByRole('link', { name: 'Đặt dịch vụ này' })).toHaveAttribute('href', '/booking/walk-3');
    expect(screen.queryByRole('link', { name: 'Đặt lịch tại cửa hàng' })).not.toBeInTheDocument();
  });
});

describe('service cards', () => {
  const card = name => screen.getByRole('heading', { name }).closest('article');

  test('Cắt móng shows two buttons, Tắm one, and other services keep the old card label', async () => {
    renderAt('/services');
    await screen.findByRole('heading', { name: 'Cắt móng' });
    const nail = within(card('Cắt móng'));
    expect(nail.getByRole('link', { name: 'Đặt lịch tại cửa hàng' })).toHaveAttribute('href', '/grooming-booking?serviceId=nail-2');
    expect(nail.getByRole('link', { name: 'Đặt tại nhà' })).toHaveAttribute('href', '/booking/nail-2');
    const bath = within(card('Tắm và vệ sinh thú cưng'));
    expect(bath.getAllByRole('link', { name: /Đặt/ })).toHaveLength(1);
    expect(bath.getByRole('link', { name: 'Đặt lịch tại cửa hàng' })).toBeVisible();
    expect(within(card('Dắt chó đi dạo')).getByRole('link', { name: 'Đặt dịch vụ' })).toHaveAttribute('href', '/booking/walk-3');
  });
});

describe('the old booking page', () => {
  test('a shop-only service sent to /booking/:id continues to the shop booking page with the service', async () => {
    renderAt('/booking/bath-1');
    expect(await screen.findByRole('heading', { name: 'Trang đặt lịch cửa hàng' })).toBeVisible();
    expect(screen.getByTestId('where')).toHaveTextContent('/grooming-booking?serviceId=bath-1');
  });

  test('a booking confirmation of that service (?booking=) is not redirected away', async () => {
    renderAt('/booking/bath-1?booking=b1');
    expect(await screen.findByRole('heading', { name: 'Tắm và vệ sinh thú cưng' })).toBeVisible();
    expect(screen.getByTestId('where')).toHaveTextContent('/booking/bath-1?booking=b1');
  });

  test('a service offered at home stays on the home booking page', async () => {
    renderAt('/booking/nail-2');
    expect(await screen.findByRole('heading', { name: 'Cắt móng' })).toBeVisible();
    expect(screen.getByTestId('where')).toHaveTextContent('/booking/nail-2');
    expect(screen.queryByRole('heading', { name: 'Trang đặt lịch cửa hàng' })).not.toBeInTheDocument();
  });
});
