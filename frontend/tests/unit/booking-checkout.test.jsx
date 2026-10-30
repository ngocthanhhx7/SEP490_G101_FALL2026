import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookingCheckoutForm, BookingConfirmation } from '../../src/pages/public/BookingCheckout.jsx';
afterEach(cleanup);
const service = { id: 'service', name: 'Chăm sóc tại gia', details: { locations: ['HOME'] } };
const quote = { quoteId: 'quote', items: [{ serviceId: 'service', visitCount: 1, servicePolicy: { title: 'Điều kiện dịch vụ', body: 'Synthetic published policy' } }] };
const apiFixture = () => ({ addresses: jest.fn().mockResolvedValue({ data: [{ id: 'address', label: 'Nhà đã xác nhận' }] }),
  checkoutOptions: jest.fn().mockResolvedValue({ data: { facilityAddress: 'Synthetic facility' } }),
  confirm: jest.fn().mockResolvedValue({ id: 'booking' }), booking: jest.fn(), paymentLink: jest.fn() });

test('booking confirmation uses the saved quote and explicit Vietnam schedule, never browser amounts', async () => {
  const api = apiFixture(), confirmed = jest.fn();
  render(<MemoryRouter><BookingCheckoutForm quote={quote} services={[service]} api={api} onConfirmed={confirmed} /></MemoryRouter>);
  await screen.findByText('Nhà đã xác nhận');
  fireEvent.change(screen.getByLabelText('Bắt đầu (giờ Việt Nam)'), { target: { value: '2026-11-03T09:00' } });
  fireEvent.change(screen.getByLabelText('Địa chỉ đã lưu'), { target: { value: 'address' } });
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  expect(api.confirm.mock.calls[0][0]).toEqual({ quoteId: 'quote', acceptServicePolicies: true,
    visits: [{ itemIndex: 0, startAt: '2026-11-03T09:00:00+07:00', location: 'HOME', addressId: 'address' }] });
  expect(confirmed).toHaveBeenCalledWith({ id: 'booking' });
});

test('unknown booking acknowledgement retains the same payload and key while schedule fields are frozen', async () => {
  const api = apiFixture(); api.confirm.mockRejectedValueOnce({ code: 'TIMEOUT' });
  render(<MemoryRouter><BookingCheckoutForm quote={quote} services={[service]} api={api} onConfirmed={jest.fn()} /></MemoryRouter>);
  await screen.findByText('Nhà đã xác nhận');
  fireEvent.change(screen.getByLabelText('Bắt đầu (giờ Việt Nam)'), { target: { value: '2026-11-03T09:00' } });
  fireEvent.change(screen.getByLabelText('Địa chỉ đã lưu'), { target: { value: 'address' } });
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
  await screen.findByText('Xác nhận lại'); expect(screen.getByLabelText('Bắt đầu (giờ Việt Nam)')).toBeDisabled();
  fireEvent.submit(screen.getByText('Xác nhận lại').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2));
  expect(api.confirm.mock.calls[0]).toEqual(api.confirm.mock.calls[1]);
});

test('return URL reads actual unpaid state; a disabled provider never creates a fake payment link', async () => {
  const api = apiFixture(); api.booking.mockResolvedValue({ id: 'booking', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
    paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] });
  api.paymentLink.mockRejectedValue({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  render(<MemoryRouter initialEntries={['/services?booking=booking']}><BookingConfirmation api={api} /></MemoryRouter>);
  await screen.findByText('Chờ thanh toán'); fireEvent.click(screen.getByText('Tạo link thanh toán'));
  await screen.findByText('Chưa thể tạo link thanh toán. Đơn vẫn đang chờ thanh toán.');
  expect(screen.queryByText('Thanh toán qua payOS')).toBeNull(); expect(api.booking).toHaveBeenCalledWith('booking', expect.any(Object));
});

test('expired booking has no payment command', async () => {
  const api = apiFixture(); api.booking.mockResolvedValue({ id: 'booking', totalVnd: 120000, state: 'PAYMENT_EXPIRED', paymentState: 'UNPAID', paymentDeadlineAt: '2020-01-01', visits: [] });
  render(<MemoryRouter initialEntries={['/services?booking=booking']}><BookingConfirmation api={api} /></MemoryRouter>);
  await screen.findByText('Đã hết hạn thanh toán'); expect(screen.queryByText('Tạo link thanh toán')).toBeNull();
});
