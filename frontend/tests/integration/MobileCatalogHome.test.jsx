import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MobileCareHome } from '../../src/pages/customer/MobileCareHome.jsx';
import { PhoneHomePage } from '../../src/pages/public/PhoneHomePage.jsx';

beforeEach(() => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
});

const service = (id, code, name) => ({ id, code, name, species: ['DOG'], details: { locations: ['HOME'] } });
const walking = { ...service('walking', 'dog-walking', 'Dắt chó đi dạo'), price: { amountVnd: 80000, unitLabel: '30 phút', currency: 'VND' } };
const homeCare = service('care', 'home-care', 'Chăm sóc tại gia');
const catalog = { data: { available: true, services: [
  service('nails', 'nail-trimming', 'Cắt móng'), walking, homeCare,
  service('vet', 'vet-escort', 'Đưa thú cưng đến lịch hẹn thú y')
] } };

function showGuest(loadCatalog) {
  function SignInDestination() {
    return <p>{useLocation().state?.from}</p>;
  }
  return render(<MemoryRouter><Routes>
    <Route index element={<PhoneHomePage loadCatalog={loadCatalog} />} />
    <Route path="/sign-in" element={<SignInDestination />} />
  </Routes></MemoryRouter>);
}

test('guest sees up to three published service details and a quiet booking resume link', async () => {
  showGuest(async () => catalog);
  const section = screen.getByRole('region', { name: 'Bé cần chăm sóc gì?' });
  const list = await within(section).findByRole('list');
  const cards = within(list).getAllByRole('link');
  expect(cards.map(link => link.getAttribute('href'))).toEqual(['/services/care', '/services/walking', '/services/vet']);
  expect(cards[1]).toHaveTextContent(/80[.\s]000.*30 phút/);
  expect(cards[0]).not.toHaveTextContent('₫');
  expect(screen.queryByText('Truy cập nhanh')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Kiểm tra khu vực phục vụ' })).toHaveAttribute('href', '/service-areas');
  fireEvent.click(screen.getByRole('link', { name: 'Đăng nhập để theo dõi' }));
  expect(screen.getByText('/account/bookings')).toBeVisible();
});

test('guest loading, network retry and empty catalog have separate states', async () => {
  const loadCatalog = jest.fn().mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ data: { available: false, services: [] } });
  showGuest(loadCatalog);
  expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Chưa có dịch vụ được công khai')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('customer shows tracking before catalog when a visit is in progress', async () => {
  const row = { id: 'visit', bookingId: 'booking', serviceName: 'Buổi đang diễn ra', state: 'IN_PROGRESS', startsAt: '2026-11-20T10:00:00Z' };
  const api = { read: jest.fn().mockResolvedValue({ data: { items: [row], metrics: [] } }) };
  render(<MemoryRouter><MobileCareHome api={api} loadCatalog={async () => catalog} /></MemoryRouter>);
  const track = await screen.findByRole('link', { name: 'Theo dõi buổi chăm sóc' });
  expect(track).toHaveAttribute('href', '/account/bookings/booking/visits/visit');
  const service = await screen.findByRole('link', { name: /Dắt chó đi dạo/ });
  expect(track.compareDocumentPosition(service) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
