import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { CustomerBookingsPage } from '../../src/pages/customer/CustomerBookingsPage.jsx';
const session = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: ['CUSTOMER'] } }) };
function show(request) { render(<SessionProvider adapter={session}><CustomerBookingsPage request={request} /></SessionProvider>); }
test('requests all states and follows older-page cursor', async () => {
  const request = jest.fn().mockResolvedValueOnce({ data: [
    { id: 'a', reference: 'DON-1', state: 'COMPLETED' }, { id: 'b', reference: 'DON-2', state: 'CANCELLED' }
  ], meta: { nextCursor: 'older-page' } }).mockResolvedValueOnce({ data: [{ id: 'c', reference: 'DON-3', state: 'CONFIRMED' }] });
  show(request);
  expect(await screen.findByText('DON-1')).toBeVisible();
  expect(screen.getByText('Đã hủy')).toBeVisible();
  expect(request).toHaveBeenNthCalledWith(1, '/bookings?limit=20', expect.any(Object));
  fireEvent.click(screen.getByRole('button', { name: 'Xem đơn cũ hơn' }));
  expect(await screen.findByText('DON-3')).toBeVisible();
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
