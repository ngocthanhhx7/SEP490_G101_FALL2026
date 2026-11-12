import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ServiceBasket } from '../../src/pages/public/ServiceBasket.jsx';
import { ServiceBookingPage } from '../../src/pages/public/ServiceBookingPage.jsx';
import { useSession } from '../../src/contexts/SessionContext.jsx';
import { createServiceBasketApi } from '../../src/services/service-basket-api.js';

jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: jest.fn() }));
jest.mock('../../src/services/service-basket-api.js', () => ({ createServiceBasketApi: jest.fn() }));

const service = { id: 'walking', name: 'Dắt chó đi dạo', price: { unitLabel: 'lần' }, species: ['DOG'] };
const loadCatalog = async () => ({ data: { services: [service] } });
const visitStart = '2099-01-01T00:00:08Z';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test.each([
  ['ServiceBookingPage', '/services/walking/book', '/services/:serviceId/book', <ServiceBookingPage loadCatalog={loadCatalog} />],
  ['ServiceBasket', '/services', '/services', <ServiceBasket services={[service]} />]
])('%s preserves the public confirmation without visit actions', async (_, path, route, element) => {
  globalThis.fetch = jest.fn();
  useSession.mockReturnValue({ status: 'authenticated', user: { id: 'owner', roles: ['CUSTOMER'] }, getCsrfToken: () => 'csrf' });
  const booking = jest.fn(async () => ({
    id: 'booking', state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', totalVnd: 120000,
    paymentDeadlineAt: '2099-01-02T00:00:08Z',
    visits: [{ id: 'visit', serviceName: service.name, startAt: visitStart, state: 'COMPLETED', petNames: ['Milo'],
      location: 'HOME', serviceAddress: 'Địa chỉ thử nghiệm' }]
  }));
  createServiceBasketApi.mockReturnValue({ booking, pets: async () => ({ data: [{ id: 'pet', species: 'DOG' }] }) });
  render(<MemoryRouter initialEntries={[path + '?booking=booking']}><Routes>
    <Route path={route} element={element} />
  </Routes></MemoryRouter>);
  const confirmation = (await screen.findByRole('heading', { name: 'Lịch chăm sóc đã đặt' })).closest('section');
  const row = within(confirmation).getByRole('listitem');
  const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  expect(row).toHaveTextContent('Buổi 1 · Milo');
  expect(row).toHaveTextContent(service.name + ' · ' + date(visitStart));
  expect(within(row).getByRole('link', { name: 'Chỉ đường bằng Google Maps' })).toBeVisible();
  expect(within(confirmation).getByText('Hạn thanh toán: ' + date('2099-01-02T00:00:08Z'))).toBeVisible();
  expect(within(confirmation).getByRole('button', { name: 'Tạo link thanh toán' })).toBeVisible();
  expect(within(row).queryByText('Đã hoàn tất')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Gửi khiếu nại' })).toBeNull();
  expect(booking).toHaveBeenCalledTimes(1);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
