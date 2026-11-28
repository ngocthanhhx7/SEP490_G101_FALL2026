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

test.each([
  ['same day', '2098-11-03T20:30', '2098-11-03T20:00'],
  ['different days', '2098-11-05T09:00', '2098-11-03T09:00']
])('numbers visits chronologically before review and checks availability in that order: %s', async (_label, later, earlier) => {
  const api = fixture();
  api.availability.mockResolvedValue({ sitters: [], complete: true });
  const nailService = { ...service, name: 'Cắt móng', price: { unitLabel: 'lượt' }, details: { ...service.details, durationMinutes: 30 } };
  render(<MemoryRouter><BookingFlow service={nailService} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: later } });
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh buổi tiếp theo' }));
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: earlier } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  await screen.findByText('Sắp xếp người chăm sóc');
  await waitFor(() => expect(api.availability).toHaveBeenCalledTimes(2));
  const expected = [earlier, later].map(value => new Date(value + '+07:00').toISOString());
  expect(api.availability.mock.calls.map(([body]) => body.visit.startAt)).toEqual(expected);
  fireEvent.click(screen.getByText('Xem lại đơn'));
  const labels = screen.getAllByText(/^Buổi \d+:/).map(row => row.textContent);
  const localLabel = value => new Date(value + '+07:00').toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short'
  });
  expect(labels).toEqual([`Buổi 1: ${localLabel(earlier)}`, `Buổi 2: ${localLabel(later)}`]);
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ', { selector: 'button' }).closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  expect(api.confirm.mock.calls[0][0].visits.map(row => row.startAt)).toEqual(expected);
});

test('pending setup stays recoverable instead of rendering incomplete customer data', async () => {
  const api = fixture(); api.addresses.mockResolvedValue({ pending: true, data: null });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được thông tin đặt lịch.');
  expect(screen.queryByText('Xem báo giá')).not.toBeInTheDocument();
});

test('a reversed schedule keeps unavailable-sitter consent on the correct chronological visit', async () => {
  const api = fixture();
  api.availability.mockImplementation(async ({ visit }) => ({ sitters: [{ id: 'sitter', displayName: 'Sitter từng chăm',
    eligible: !visit.startAt.startsWith('2098-11-05'), unavailableReason: 'DAY_OFF' }], complete: true }));
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-05T09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh buổi tiếp theo' }));
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  fireEvent.click(await screen.findByRole('radio', { name: /Sitter từng chăm/ }));
  await reviewAndConfirm();
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('không rảnh vào Buổi 2');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Vẫn đặt lịch' }));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  const confirmed = api.confirm.mock.calls[0][0].visits;
  expect(confirmed[0]).toMatchObject({ startAt: '2098-11-03T02:00:00.000Z', requestedSitterId: 'sitter' });
  expect(confirmed[0]).not.toHaveProperty('acceptUnavailableSitter');
  expect(confirmed[1]).toMatchObject({ startAt: '2098-11-05T02:00:00.000Z', requestedSitterId: 'sitter', acceptUnavailableSitter: true });
});

test('sorting reversed visits does not allow overlapping care times', async () => {
  const api = fixture();
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T20:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh buổi tiếp theo' }));
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: '2098-11-03T20:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  expect(screen.getByRole('alert')).toHaveTextContent('trùng giờ chăm sóc');
  expect(api.quote).not.toHaveBeenCalled();
  expect(api.confirm).not.toHaveBeenCalled();
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
    expect.objectContaining({ bookingMode: 'DIRECT', requestedSitterId: 'sitter1', acceptUnavailableSitter: true }),
    expect.objectContaining({ bookingMode: 'DIRECT', requestedSitterId: 'sitter1' })
  ]);
  expect(api.confirm.mock.calls[0][0].visits[1]).not.toHaveProperty('acceptUnavailableSitter');
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

test('ST-BKG-12 shows MSG20 message when confirm rejects a booking longer than 30 days', async () => {
  const api = fixture();
  api.confirm.mockRejectedValueOnce({ status: 422, code: 'MSG20' });
  await chooseSchedule(api);
  await reviewAndConfirm();
  expect(await screen.findByText('Một lịch đặt kéo dài tối đa 30 ngày.')).toBeVisible();
});

test('ST-BKG-01: the confirmation lists visits, price per visit, both discounts and the total', async () => {
  const api = fixture();
  api.quote.mockResolvedValue({ ...quote, baseVnd: 200000, discountVnd: 4000, tierDiscountVnd: 0, totalVnd: 196000,
    tier: { code: 'MEMBER' }, items: [{ ...quote.items[0], serviceId: 'service', visitCount: 2, subtotalVnd: 196000 }] });
  await chooseSchedule(api);
  fireEvent.click(screen.getByText('Xem lại đơn'));
  const line = label => screen.getByText(label, { selector: 'dt' }).parentElement;
  expect(line('Chăm sóc tại nhà · 2 buổi · Giá một buổi')).toHaveTextContent('98.000 ₫');
  expect(line('Giảm nhiều buổi')).toHaveTextContent('− 4.000 ₫');
  expect(line('Giảm giá hạng Member')).toHaveTextContent('− 0 ₫');
  expect(line('Tổng thanh toán')).toHaveTextContent('196.000 ₫');
  expect(screen.queryByText('Phí bậc giá')).not.toBeInTheDocument();
});

test('ST-BKG-14: an address outside the service area cannot be used and says why', async () => {
  const api = fixture();
  api.addresses.mockResolvedValue({ data: [
    { id: 'address', label: 'Nhà đã xác nhận', served: true },
    { id: 'far', label: 'Nhà ngoài vùng', served: false, pointConfirmedAt: '2026-11-01T00:00:00Z' },
    { id: 'draft', label: 'Nhà chưa ghim', served: false }
  ] });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  await screen.findByLabelText('Milo · 4 kg');
  expect(screen.getByRole('option', { name: 'Nhà ngoài vùng — Chưa phục vụ' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Nhà chưa ghim — Chưa xác nhận vị trí' })).toBeDisabled();
  expect(screen.getByText('Nhà ngoài vùng: Rất tiếc, chúng tôi chưa phục vụ địa chỉ này.')).toBeVisible();
  expect(screen.queryByText(/Nhà chưa ghim: Rất tiếc/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'far' } });
  expect(screen.getByRole('button', { name: 'Xem báo giá' })).toBeDisabled();
});

test('ST-BKG-14: a refused service area is explained when the booking is confirmed', async () => {
  const api = fixture(); api.confirm.mockRejectedValue({ code: 'ADDRESS_OUT_OF_SERVICE_AREA', status: 422 });
  await chooseSchedule(api);
  await reviewAndConfirm();
  expect(await screen.findByRole('alert')).toHaveTextContent('Rất tiếc, chúng tôi chưa phục vụ địa chỉ này.');
});

const debtText = 'Bạn còn khoản chưa thanh toán cho lịch spa. Vui lòng thanh toán tại cửa hàng trước khi đặt lịch mới.';

test('ST-BKG-14: unpaid grooming is shown above the form and the booking cannot be confirmed', async () => {
  const api = fixture();
  api.checkoutOptions.mockResolvedValue({ data: { sitters: [], groomingPaymentOutstanding: true } });
  await chooseSchedule(api);
  expect(screen.getByRole('alert')).toHaveTextContent(debtText);
  fireEvent.click(screen.getByText('Xem lại đơn'));
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ.'));
  expect(screen.getByRole('button', { name: 'Xác nhận đặt dịch vụ' })).toBeDisabled();
  expect(api.confirm).not.toHaveBeenCalled();
});

test('ST-BKG-14: a grooming debt found at confirmation shows the same message and blocks retries', async () => {
  const api = fixture(); api.confirm.mockRejectedValue({ code: 'GROOMING_PAYMENT_OUTSTANDING', status: 409 });
  await chooseSchedule(api);
  await reviewAndConfirm();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(debtText);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận đặt dịch vụ' })).toBeDisabled());
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});

test('ST-BKG-11 shows MSG19 under the date/time field when home booking is less than 2 hours ahead and maps server error', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-28T03:00:00Z'));
  try {
    const api = fixture();
    api.confirm.mockRejectedValueOnce({ code: 'HOME_BOOKING_NOTICE_REQUIRED', status: 422 });
    render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
    fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
    const startInput = screen.getByLabelText('Buổi 1 (giờ Việt Nam)');
    expect(startInput).not.toHaveAttribute('min');
    fireEvent.change(startInput, { target: { value: '2026-11-28T11:00' } });
    const timeInput = screen.getByLabelText(/Chọn giờ khác trong ngày/);
    expect(timeInput).not.toHaveAttribute('min');
    fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
    const fieldContainer = startInput.closest('.pwc-booking-daytime');
    expect(within(fieldContainer).getByText('Vui lòng đặt lịch trước ít nhất 2 giờ.')).toBeVisible();
    expect(api.quote).not.toHaveBeenCalled();

    fireEvent.change(startInput, { target: { value: '2026-11-28T12:30' } });
    fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
    await screen.findByText('Sắp xếp người chăm sóc');
    await reviewAndConfirm();
    const resumedInput = await screen.findByLabelText('Buổi 1 (giờ Việt Nam)');
    expect(within(resumedInput.closest('.pwc-booking-daytime')).getByText('Vui lòng đặt lịch trước ít nhất 2 giờ.')).toBeVisible();
  } finally {
    jest.useRealTimers();
  }
});

test('MSG19 from the server stays on the rejected visit when switching visits', async () => {
  const api = fixture();
  api.confirm.mockRejectedValueOnce({ code: 'HOME_BOOKING_NOTICE_REQUIRED', status: 422,
    lineFields: { 1: { startAt: 'HOME_BOOKING_NOTICE_REQUIRED' } } });
  render(<MemoryRouter><BookingFlow service={service} api={api} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Chỉnh buổi tiếp theo' }));
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: '2098-11-04T09:00' } });
  fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
  await screen.findByText('Sắp xếp người chăm sóc');
  await reviewAndConfirm();

  const rejected = await screen.findByLabelText('Buổi 2 (giờ Việt Nam)');
  const message = 'Vui lòng đặt lịch trước ít nhất 2 giờ.';
  expect(within(rejected.closest('.pwc-booking-daytime')).getByText(message)).toBeVisible();
  fireEvent.change(screen.getByRole('combobox', { name: /Buổi cần chỉnh/i }), { target: { value: '0' } });
  expect(screen.getByLabelText('Buổi 1 (giờ Việt Nam)')).toHaveAttribute('aria-invalid', 'false');
  expect(screen.queryByText(message)).not.toBeInTheDocument();
});

test('non-HOME service blocks past time under the date/time field without quoting and allows valid future time', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-28T03:00:00Z'));
  try {
    const api = fixture();
    const outdoorService = {
      id: 'dog-walking', name: 'Dắt chó đi dạo', code: 'dog-walking', species: ['DOG'],
      price: { unitLabel: 'lượt' }, details: { locations: ['OUTDOOR'], durationMinutes: 30 }
    };
    render(<MemoryRouter><BookingFlow service={outdoorService} api={api} onBooked={jest.fn()} /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
    fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
    const startInput = screen.getByLabelText('Buổi 1 (giờ Việt Nam)');
    fireEvent.change(startInput, { target: { value: '2026-11-28T09:00' } });
    fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
    const fieldContainer = startInput.closest('.pwc-booking-daytime');
    expect(within(fieldContainer).getByText('Buổi 1. Chọn giờ trong tương lai, sau hạn thanh toán nếu đơn cần trả trước.')).toBeVisible();
    expect(api.quote).not.toHaveBeenCalled();

    fireEvent.change(startInput, { target: { value: '2026-11-28T11:00' } });
    fireEvent.submit(screen.getByText('Xem báo giá').closest('form'));
    await screen.findByText('Sắp xếp người chăm sóc');
    expect(api.quote).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
