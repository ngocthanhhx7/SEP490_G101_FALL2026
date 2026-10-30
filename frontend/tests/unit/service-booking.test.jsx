import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookingFlow } from '../../src/pages/public/ServiceBookingPage.jsx';

const service = { id: 'service', name: 'Chăm sóc tại nhà', code: 'home-care', species: ['DOG'], price: { unitLabel: 'tiếng' }, details: { locations: ['HOME'], durationMinutes: 60 } };
const quote = { quoteId: 'quote', totalVnd: 120000, baseVnd: 120000, surchargeVnd: 0, discountVnd: 0, orderFeeVnd: 0,
  expiresAt: '2099-01-01T00:00:00Z', paymentMode: 'POSTPAY', items: [{ servicePolicy: { title: 'Điều kiện chăm sóc', body: 'Phạm vi đã công bố' } }] };
function fixture() {
  return { pets: jest.fn(async () => ({ data: [{ id: 'pet', name: 'Milo', species: 'DOG', weightKg: 4 }] })),
    addresses: jest.fn(async () => ({ data: [{ id: 'address', label: 'Nhà đã xác nhận' }] })),
    checkoutOptions: jest.fn(async () => ({ data: {} })), quote: jest.fn(async () => quote),
    availability: jest.fn(async () => ({ sitters: [{ id: 'sitter', displayName: 'Sitter phù hợp' }], complete: true })),
    confirm: jest.fn(async () => ({ id: 'booking' })) };
}
async function chooseSchedule(api, matching = {}, onBooked = jest.fn()) {
  render(<MemoryRouter><BookingFlow service={service} api={api} matching={matching} onBooked={onBooked} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.submit(screen.getByText('Tiếp tục').closest('form'));
  await screen.findByText('Bạn muốn chọn pet sitter theo cách nào?');
}
async function reviewAndConfirm() {
  fireEvent.click(screen.getByText('Xem lại đơn'));
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ', { selector: 'button' }).closest('form'));
}
test('pending setup stays recoverable instead of rendering incomplete customer data', async () => {
  const api = fixture(); api.addresses.mockResolvedValue({ pending: true, data: null });
  render(<MemoryRouter><BookingFlow service={service} api={api} matching={{}} onBooked={jest.fn()} /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được thông tin đặt lịch.');
  expect(screen.queryByText('Tiếp tục')).not.toBeInTheDocument();
});

test('system booking creates the selected service schedule without a directed employee', async () => {
  const api = fixture(), booked = jest.fn(); await chooseSchedule(api, {}, booked); await reviewAndConfirm();
  await waitFor(() => expect(booked).toHaveBeenCalledWith({ id: 'booking' }));
  expect(api.quote).toHaveBeenCalledWith([{ serviceId: 'service', petIds: ['pet'], durationMinutes: 60, visitCount: 1 }]);
  expect(api.confirm.mock.calls[0][0]).toEqual({ quoteId: 'quote', acceptServicePolicies: true, visits: [{ itemIndex: 0,
    location: 'HOME', addressId: 'address', startAt: '2098-11-03T02:00:00.000Z', bookingMode: 'SYSTEM' }] });
});
test('directed booking checks availability before selection and retains the same command on uncertain response', async () => {
  const api = fixture(); api.confirm.mockRejectedValueOnce({ code: 'TIMEOUT' }); await chooseSchedule(api);
  fireEvent.click(screen.getByLabelText('Chỉ định pet sitter'));
  expect(screen.getByText('Xem lại đơn')).toBeDisabled();
  fireEvent.click(screen.getByText('Tìm sitter phù hợp'));
  fireEvent.click(await screen.findByLabelText('Sitter phù hợp')); await reviewAndConfirm();
  await screen.findByText('Kiểm tra lại đơn');
  fireEvent.submit(screen.getByText('Kiểm tra lại đơn').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2));
  expect(api.confirm.mock.calls[0]).toEqual(api.confirm.mock.calls[1]);
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'DIRECT', requestedSitterId: 'sitter' });
});
test('AI shortlist reference reaches system checkout, without directing or assigning its top sitter', async () => {
  const api = fixture(), matching = { recommend: jest.fn(async () => ({ matchId: 'match', expiresAt: '2099-01-01', candidates: [{ sitterId: 'sitter', displayName: 'Gợi ý', score: 82, breakdown: [] }] })) };
  await chooseSchedule(api, matching); fireEvent.click(screen.getByText('Xem gợi ý cho lịch này'));
  await screen.findByText('Gợi ý'); await reviewAndConfirm(); await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'SYSTEM', matchId: 'match' });
  expect(api.confirm.mock.calls[0][0].visits[0]).not.toHaveProperty('requestedSitterId');
});
test('empty eligibility cannot be selected as a directed booking', async () => {
  const api = fixture(); api.availability.mockResolvedValue({ sitters: [], complete: true }); await chooseSchedule(api);
  fireEvent.click(screen.getByLabelText('Chỉ định pet sitter')); fireEvent.click(screen.getByText('Tìm sitter phù hợp'));
  await screen.findByText(/Chưa có sitter đáp ứng tất cả buổi/); expect(screen.getByText('Xem lại đơn')).toBeDisabled();
  expect(api.confirm).not.toHaveBeenCalled();
});
