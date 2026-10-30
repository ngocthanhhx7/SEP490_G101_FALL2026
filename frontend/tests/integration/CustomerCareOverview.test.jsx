import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerDashboardPage } from '../../src/pages/customer/CustomerDashboardPage.jsx';
import { useSession } from '../../src/contexts/SessionContext.jsx';
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: jest.fn() }));
beforeEach(() => useSession.mockReturnValue({ status: 'authenticated', user: { id: 'synthetic', displayName: 'Nguyễn An', roles: ['CUSTOMER'] } }));
const result = (items = [], nextCursor = null) => ({ data: { metrics: [{ key: 'upcomingVisits', label: 'Buổi sắp tới', value: 2 }], items, nextCursor } });
const show = api => render(<MemoryRouter><CustomerDashboardPage api={api} /></MemoryRouter>);
test('shows authoritative counters, empty schedule and booking link', async () => {
  show({ read: async () => result() });
  expect(await screen.findByText('Chưa có lịch chăm sóc')).toBeVisible();
  expect(screen.getByText('2')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Đặt dịch vụ' })).toHaveAttribute('href', '/services');
});
test('date filter and pagination retain server cursor and reset on new filters', async () => {
  const api = { read: jest.fn(async () => result([{ id: 'synthetic-visit', startsAt: '2026-11-01T01:00:00Z', state: 'ASSIGNED' }], 'cursor-two')) };
  show(api);
  await screen.findByText('Đã có người chăm sóc');
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }));
  await waitFor(() => expect(api.read).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-two', limit: 10 })));
  fireEvent.click(screen.getByText('Lọc theo ngày'));
  fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
  await waitFor(() => expect(api.read).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-11-01' })));
  expect(api.read.mock.calls.at(-1)[0].cursor).toBeUndefined();
});
test('failed read does not pretend there are zero bookings and can retry', async () => {
  const api = { read: jest.fn().mockRejectedValueOnce(new Error('private detail')).mockResolvedValue(result()) };
  show(api);
  await screen.findByText('Chưa tải được lịch chăm sóc');
  expect(screen.queryByText('Chưa có lịch chăm sóc')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('Chưa có lịch chăm sóc')).toBeVisible();
});
