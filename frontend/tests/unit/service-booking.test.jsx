import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookingFlow } from '../../src/pages/public/ServiceBookingPage.jsx';

const service = { id: 'service', name: 'Chăm sóc tại nhà', code: 'home-care', species: ['DOG'], price: { unitLabel: 'tiếng' }, details: { locations: ['HOME'], durationMinutes: 60 } };
const quote = {
  quoteId: 'quote', totalVnd: 120000, baseVnd: 120000, surchargeVnd: 0, discountVnd: 0, orderFeeVnd: 0,
  expiresAt: '2099-01-01T00:00:00Z', paymentMode: 'POSTPAY', items: [{ servicePolicy: { title: 'Điều kiện chăm sóc', body: 'Phạm vi đã công bố' } }]
};

function fixture() {
  return {
    pets: jest.fn(async () => ({ data: [{ id: 'pet', name: 'Milo', species: 'DOG', weightKg: 4 }] })),
    addresses: jest.fn(async () => ({ data: [{ id: 'address', label: 'Nhà đã xác nhận' }] })),
    checkoutOptions: jest.fn(async () => ({ data: { recommendationAllowed: false, sitters: [] } })),
    quote: jest.fn(async () => quote),
    availability: jest.fn(async () => ({ sitters: [{ id: 'sitter', displayName: 'Sitter từng chăm', eligible: true, unavailableReason: null }], complete: true, nextPage: null })),
    confirm: jest.fn(async () => ({ id: 'booking' }))
  };
}

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

async function chooseSchedule(api, onBooked = jest.fn(), selectedService = service) {
  render(<MemoryRouter><BookingFlow service={selectedService} api={api} onBooked={onBooked} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  await screen.findByText('Sắp xếp người chăm sóc');
}

async function reviewAndConfirm() {
  fireEvent.click(screen.getByText('Xem lại đơn'));
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ', { selector: 'button' }).closest('form'));
}

test('pending setup stays recoverable instead of rendering incomplete customer data', async () => {
  const api = fixture(); api.addresses.mockResolvedValue({ pending: true, data: null });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được thông tin đặt lịch.');
  expect(screen.queryByText('Xem báo giá')).not.toBeInTheDocument();
});

test('quote policy review failure explains why no booking was created and keeps the pet selection', async () => {
  const api = fixture(); api.quote.mockRejectedValue({ code: 'PRICING_REVIEW_REQUIRED', status: 409 });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('chưa có quy tắc giá được duyệt');
  expect(screen.getByLabelText('Milo · 4 kg')).toBeChecked();
  expect(api.confirm).not.toHaveBeenCalled();
});

test('system booking creates the selected service schedule without a preferred sitter when customer has no prior sitters', async () => {
  const api = fixture(), booked = jest.fn();
  api.availability.mockResolvedValue({ sitters: [], complete: true, nextPage: null });
  await chooseSchedule(api, booked);
  await screen.findByText(/PawWorld sẽ tự sắp xếp người chăm sóc phù hợp/);
  expect(screen.queryByText('Người chăm sóc mong muốn')).not.toBeInTheDocument();
  expect(screen.queryByText(/Chỉ định pet sitter/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Xem gợi ý cho lịch này')).not.toBeInTheDocument();
  await reviewAndConfirm();
  await waitFor(() => expect(booked).toHaveBeenCalledWith({ id: 'booking' }));
  expect(api.quote).toHaveBeenCalledWith([{ serviceId: 'service', petIds: ['pet'], durationMinutes: 60, visitCount: 1 }]);
  expect(api.confirm.mock.calls[0][0]).toEqual({
    quoteId: 'quote', acceptServicePolicies: true,
    visits: [{ itemIndex: 0, location: 'HOME', addressId: 'address', startAt: '2098-11-03T02:00:00.000Z', bookingMode: 'SYSTEM' }]
  });
});

test('ST-BKG-21: preferred sitter picker shows only previous sitters under Người chăm sóc mong muốn and retains command on timeout', async () => {
  const api = fixture(); api.confirm.mockRejectedValueOnce({ code: 'TIMEOUT' });
  await chooseSchedule(api);
  expect(await screen.findByText('Người chăm sóc mong muốn')).toBeVisible();
  expect(screen.queryByText(/Chỉ định pet sitter/i)).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('radio', { name: /Sitter từng chăm/ }));
  await reviewAndConfirm();
  await screen.findByText('Kiểm tra lại đơn');
  fireEvent.submit(screen.getByText('Kiểm tra lại đơn').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2));
  expect(api.confirm.mock.calls[0]).toEqual(api.confirm.mock.calls[1]);
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'DIRECT', requestedSitterId: 'sitter' });
});

test('ST-BKG-21 / GBR-12: unavailable preferred sitter triggers MSG162 allowing change dates or book anyway', async () => {
  const api = fixture(), booked = jest.fn();
  api.availability
    .mockResolvedValueOnce({ sitters: [{ id: 'sitter1', displayName: 'sitter_01', eligible: false, unavailableReason: 'OUTSIDE_WORKING_HOURS' }], complete: true })
    .mockResolvedValueOnce({ sitters: [{ id: 'sitter1', displayName: 'sitter_01', eligible: true, unavailableReason: null }], complete: true });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={booked} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh buổi tiếp theo' }));
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: '2098-11-04T09:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  await screen.findByText('Người chăm sóc mong muốn');

  const radio = await screen.findByRole('radio', { name: /sitter_01/ });
  expect(radio).not.toBeDisabled();
  fireEvent.click(radio);
  await reviewAndConfirm();

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('sitter_01 không rảnh vào Buổi 1');
  expect(api.confirm).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Vẫn đặt lịch' }));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  expect(api.confirm.mock.calls[0][0].visits).toEqual([
    expect.objectContaining({ bookingMode: 'DIRECT', requestedSitterId: 'sitter1' }),
    expect.objectContaining({ bookingMode: 'DIRECT', requestedSitterId: 'sitter1' })
  ]);
  expect(booked).toHaveBeenCalledWith({ id: 'booking' });
});

test('pricing review names the missing care traits without clearing the owned pet selection', async () => {
  const api = fixture(); api.quote.mockRejectedValue({ code: 'PRICING_REVIEW_REQUIRED', status: 409, fieldErrors: { petTraits: 'Đặc điểm chưa có quy tắc giá được duyệt: Cần làm quen chậm, Cần hỗ trợ lồng vận chuyển.' } });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cần làm quen chậm, Cần hỗ trợ lồng vận chuyển');
  expect(screen.getByLabelText('Milo · 4 kg')).toBeChecked(); expect(api.confirm).not.toHaveBeenCalled();
});

test('extended play explains the selected billed duration rather than silently adding free time', async () => {
  const api = fixture(); api.pets.mockResolvedValue({ data: [{ id: 'pet', name: 'Milo', species: 'DOG', weightKg: 4, traits: ['extended-play'] }] });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  expect(screen.getByRole('status')).toHaveTextContent('thời lượng dịch vụ đã chọn'); expect(screen.getByRole('status')).toHaveTextContent('không tự cộng thêm phút');
});

test.each(['ngày', 'km'])('extended-play notice does not invent minutes for service unit %s', async unitLabel => {
  const api = fixture(); api.pets.mockResolvedValue({ data: [{ id: 'pet', name: 'Milo', species: 'DOG', weightKg: 4, traits: ['extended-play'] }] });
  render(<MemoryRouter><BookingFlow service={{ ...service, price: { unitLabel }, details: { locations: ['HOME'] } }} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  expect(screen.getByRole('status')).toHaveTextContent('thời lượng dịch vụ đã chọn'); expect(screen.getByRole('status')).not.toHaveTextContent(/\d+ phút/);
});

test('boarding arranges shifts through PawWorld without calling sitter availability', async () => {
  const api = fixture();
  await chooseSchedule(api, jest.fn(), { ...service, price: { unitLabel: 'ngày' } });
  await reviewAndConfirm(); await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'SYSTEM' });
  expect(api.confirm.mock.calls[0][0].visits[0]).not.toHaveProperty('requestedSitterId');
  expect(api.availability).not.toHaveBeenCalled();
});

test('chooses separate times across weeks and returns to the right visit when a date is incomplete', async () => {
  const api = fixture();
  api.availability.mockResolvedValue({ sitters: [], complete: true });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Các ngày trong tuần' })).getByRole('button', { name: /10 tháng 11, 2098/ }));
  fireEvent.click(screen.getByRole('button', { name: /10\/11, 10:00/ }));
  expect(screen.getByLabelText('Buổi 1 (giờ Việt Nam)')).toHaveValue('2098-11-10T10:00');
  expect(screen.getByTitle('10:00–11:00 · Buổi 1')).toBeVisible();
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  expect(screen.getByRole('alert')).toHaveTextContent('Buổi 2');
  expect(screen.getByLabelText('Buổi 2 (giờ Việt Nam)')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: '2098-11-11T14:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  await screen.findByText('Sắp xếp người chăm sóc');
  await reviewAndConfirm();
  await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits.map(row => row.startAt)).toEqual([
    '2098-11-10T03:00:00.000Z', '2098-11-11T07:00:00.000Z'
  ]);
});

test('monthly draft skips missing dates, accepts a visit removal and confirms the final list', async () => {
  const api = fixture();
  api.availability.mockResolvedValue({ sitters: [], complete: true });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.click(screen.getByText('Tạo lịch lặp theo tuần hoặc tháng'));
  fireEvent.click(screen.getByRole('radio', { name: 'Hằng tháng' }));
  fireEvent.change(screen.getByLabelText('Ngày bắt đầu'), { target: { value: '2098-01-31' } });
  fireEvent.change(screen.getByLabelText('Giờ chăm sóc'), { target: { value: '10:15' } });
  fireEvent.change(screen.getByLabelText('Số buổi lặp'), { target: { value: '3' } });
  expect(screen.getByText(/Bỏ qua tháng/)).toHaveTextContent('02/2098');
  fireEvent.click(screen.getByText('Dùng lịch này'));
  fireEvent.change(screen.getByLabelText('Buổi cần chỉnh'), { target: { value: '1' } });
  fireEvent.click(screen.getByText('Bỏ buổi này'));
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  await screen.findByText('Sắp xếp người chăm sóc');
  expect(api.quote.mock.calls[0][0][0].visitCount).toBe(2);
  await reviewAndConfirm();
  await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits.map(row => row.startAt)).toEqual(['2098-01-31T03:15:00.000Z', '2098-05-31T03:15:00.000Z']);
});
