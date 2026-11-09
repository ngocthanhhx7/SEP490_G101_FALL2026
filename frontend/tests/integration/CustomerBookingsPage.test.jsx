import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { CustomerBookingsPage } from '../../src/pages/customer/CustomerBookingsPage.jsx';
const session = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: ['CUSTOMER'] } }) };
function show(request) { render(<MemoryRouter><SessionProvider adapter={session}><CustomerBookingsPage request={request} /></SessionProvider></MemoryRouter>); }
test('requests all states and follows older-page cursor', async () => {
  const request = jest.fn().mockResolvedValueOnce({ data: [
    { id: 'a', reference: 'DON-1', state: 'COMPLETED' }, { id: 'b', reference: 'DON-2', state: 'CANCELLED' }
  ], meta: { nextCursor: 'older-page' } }).mockResolvedValueOnce({ data: [{ id: 'c', reference: 'DON-3', state: 'CONFIRMED' }] });
  show(request);
  expect(await screen.findByText(/DON-1/)).toBeVisible();
  expect(screen.getByText('Đã hủy')).toBeVisible();
  expect(request).toHaveBeenNthCalledWith(1, '/bookings?limit=20', expect.any(Object));
  fireEvent.click(screen.getByRole('button', { name: 'Xem đơn cũ hơn' }));
  expect(await screen.findByText(/DON-3/)).toBeVisible();
  expect(request).toHaveBeenNthCalledWith(2, '/bookings?limit=20&cursor=older-page', expect.any(Object));
});
test('does not present an unavailable API as an empty booking history and can retry', async () => {
  const request = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ data: [] });
  show(request);
  expect(await screen.findByText('Chưa tải được đơn hàng')).toBeVisible();
  expect(screen.queryByText('Chưa có đơn hàng')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Chưa có đơn hàng')).toBeVisible();
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});


test('service, pet, date and amount identify an order; white detail action targets its dedicated account route', async () => {
  const id = '6af12574c1cc582ac5cbe5aa';
  show(jest.fn().mockResolvedValue({ data: { items: [{ id, state: 'DISPATCH_PENDING', serviceName: 'Cắt móng',
    petNames: ['Milo', 'Miu'], firstVisitAt: '2026-11-12T02:00:00Z', visitCount: 2, totalVnd: 240000 }], nextCursor: null } }));
  expect(await screen.findByRole('heading', { name: 'Cắt móng' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: id })).not.toBeInTheDocument();
  expect(screen.getByText('Milo, Miu')).toBeVisible();
  expect(screen.getByText('2 buổi chăm sóc · Giờ Việt Nam')).toBeVisible();
  const link = screen.getByRole('link', { name: /Xem chi tiết Cắt móng/ });
  expect(link).toHaveAttribute('href', `/account/bookings/${id}`);
  expect(link).toHaveClass('customer-bookings__detail-button');
  expect(link.parentElement).toContainElement(screen.getByText('Chờ người chăm sóc'));
});
