import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ServiceBasket } from '../../src/pages/public/ServiceBasket.jsx';
import { useSession } from '../../src/contexts/SessionContext.jsx';
import { createServiceBasketApi } from '../../src/services/service-basket-api.js';
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: jest.fn() }));
jest.mock('../../src/services/service-basket-api.js', () => ({ createServiceBasketApi: jest.fn() }));
afterEach(cleanup);
const serviceId = 'a'.repeat(24), petId = 'b'.repeat(24);
const services = [{ id: serviceId, name: 'Tắm thú cưng', species: ['DOG'], price: { unitLabel: 'lần' }, details: { durationMinutes: 60 } }];
const result = { items: [], baseVnd: 300000, surchargeVnd: 0, discountVnd: 9000, orderFeeVnd: 0, totalVnd: 291000, paymentMode: 'PREPAY', expiresAt: '2026-11-01T10:00:00Z' };
function setup() {
  useSession.mockReturnValue({ status: 'authenticated', user: { id: 'owner', roles: ['CUSTOMER'] }, getCsrfToken: () => 'synthetic-csrf' });
  const api = { pets: jest.fn().mockResolvedValue({ data: [{ id: petId, name: 'Synthetic dog', species: 'DOG' }] }), quote: jest.fn().mockResolvedValue(result) };
  createServiceBasketApi.mockReturnValue(api); return api;
}
function renderBasket() { render(<MemoryRouter><ServiceBasket services={services} /></MemoryRouter>); }
async function fillBasket() {
  await screen.findByText('Thêm dịch vụ'); fireEvent.click(screen.getByText('Thêm dịch vụ'));
  fireEvent.change(screen.getByLabelText('Thú cưng'), { target: { value: petId } });
  fireEvent.change(screen.getByLabelText('Số lượt'), { target: { value: '3' } });
}
test('guest sees sign-in and does not query private pets', () => {
  const api = setup(); useSession.mockReturnValue({ status: 'guest' }); renderBasket();
  expect(screen.getByRole('link', { name: /Đăng nhập/ }).getAttribute('href')).toBe('/sign-in'); expect(api.pets).not.toHaveBeenCalled();
});
test('customer sends service visits and owned pet to backend, then clears stale quote on edit', async () => {
  const api = setup(); renderBasket(); await fillBasket(); fireEvent.click(screen.getByText('Xem báo giá'));
  await screen.findByText(/Thanh toán trước/);
  expect(api.quote).toHaveBeenCalledWith([{ serviceId, petIds: [petId], visitCount: 3, durationMinutes: 60 }]);
  fireEvent.change(screen.getByLabelText('Số lượt'), { target: { value: '4' } });
  expect(screen.queryByText('Tổng dự kiến')).toBeNull();
});
test('quote response arriving after an edit cannot restore obsolete price', async () => {
  const api = setup(); let resolve; api.quote.mockReturnValue(new Promise(done => { resolve = done; }));
  renderBasket(); await fillBasket(); fireEvent.click(screen.getByText('Xem báo giá'));
  await waitFor(() => expect(api.quote).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Số lượt'), { target: { value: '4' } });
  await act(async () => resolve(result)); expect(screen.queryByText('Tổng dự kiến')).toBeNull();
});
test('empty owned-pet list offers profile entry without enabling quotes', async () => {
  const api = setup(); api.pets.mockResolvedValue({ data: [] }); renderBasket();
  await screen.findByText('Thêm hồ sơ thú cưng'); expect(screen.queryByText('Xem báo giá')).toBeNull();
});
