import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookingFlow } from '../../src/pages/public/ServiceBookingPage.jsx';

const service = { id: 'service', name: 'Chăm sóc tại nhà', code: 'home-care', species: ['DOG'], price: { unitLabel: 'tiếng' }, details: { locations: ['HOME'], durationMinutes: 60 } };
const quote = { quoteId: 'quote', totalVnd: 120000, baseVnd: 120000, surchargeVnd: 0, discountVnd: 0, orderFeeVnd: 0,
  expiresAt: '2099-01-01T00:00:00Z', paymentMode: 'POSTPAY', items: [{ servicePolicy: { title: 'Điều kiện chăm sóc', body: 'Phạm vi đã công bố' } }] };
function fixture() {
  return { pets: jest.fn(async () => ({ data: [{ id: 'pet', name: 'Milo', species: 'DOG', weightKg: 4 }] })),
    addresses: jest.fn(async () => ({ data: [{ id: 'address', label: 'Nhà đã xác nhận' }] })),
    checkoutOptions: jest.fn(async () => ({ data: { recommendationAllowed: true } })), quote: jest.fn(async () => quote),
    availability: jest.fn(async () => ({ sitters: [{ id: 'sitter', displayName: 'Sitter phù hợp', eligible: true, rating: null, reviewCount: 0 }], complete: true, nextPage: null })),
    confirm: jest.fn(async () => ({ id: 'booking' })) };
}
async function chooseSchedule(api, matching = {}, onBooked = jest.fn(), selectedService = service) {
  render(<MemoryRouter><BookingFlow service={selectedService} api={api} matching={matching} onBooked={onBooked} /></MemoryRouter>);
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

test('quote policy review failure explains why no booking was created and keeps the pet selection', async () => {
  const api = fixture(); api.quote.mockRejectedValue({ code: 'PRICING_REVIEW_REQUIRED', status: 409 });
  render(<MemoryRouter><BookingFlow service={service} api={api} matching={{}} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.submit(screen.getByText('Tiếp tục').closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('chưa có quy tắc giá được duyệt');
  expect(screen.getByLabelText('Milo · 4 kg')).toBeChecked();
  expect(api.confirm).not.toHaveBeenCalled();
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
  fireEvent.click(await screen.findByRole('radio', { name: /Sitter phù hợp/ })); await reviewAndConfirm();
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
  fireEvent.click(screen.getByLabelText('Chỉ định pet sitter'));
  await screen.findByText(/Chưa có sitter đăng ký dịch vụ này/); expect(screen.getByText('Xem lại đơn')).toBeDisabled();
  expect(api.confirm).not.toHaveBeenCalled();
});

test('empty AI advice explains quality gates and explicit system fallback creates no fake match', async () => {
  const api = fixture(), matching = { recommend: jest.fn(async () => ({ matchId: 'empty-match', expiresAt: '2099-01-01', candidates: [], exclusions: { BELOW_AUTOMATIC_THRESHOLD: 2 } })) };
  await chooseSchedule(api, matching); fireEvent.click(screen.getByText('Xem gợi ý cho lịch này'));
  expect(await screen.findByText(/Chưa đủ điểm phù hợp hoặc dữ liệu chất lượng/)).toBeInTheDocument();
  expect(screen.getByText('Xem lại đơn')).toBeDisabled(); expect(api.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Để hệ thống sắp xếp'));
  await reviewAndConfirm(); await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'SYSTEM' });
  expect(api.confirm.mock.calls[0][0].visits[0]).not.toHaveProperty('matchId');
});


test('pricing review names the missing care traits without clearing the owned pet selection', async () => {
  const api=fixture();api.quote.mockRejectedValue({code:'PRICING_REVIEW_REQUIRED',status:409,fieldErrors:{petTraits:'Đặc điểm chưa có quy tắc giá được duyệt: Cần làm quen chậm, Cần hỗ trợ lồng vận chuyển.'}});
  render(<MemoryRouter><BookingFlow service={service} api={api} matching={{}} onBooked={jest.fn()}/></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'),{target:{value:'2098-11-03T09:00'}});
  fireEvent.submit(screen.getByText('Tiếp tục').closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cần làm quen chậm, Cần hỗ trợ lồng vận chuyển');
  expect(screen.getByLabelText('Milo · 4 kg')).toBeChecked();expect(api.confirm).not.toHaveBeenCalled();
});


test('extended play explains the selected billed duration rather than silently adding free time', async()=>{
 const api=fixture();api.pets.mockResolvedValue({data:[{id:'pet',name:'Milo',species:'DOG',weightKg:4,traits:['extended-play']}]});
 render(<MemoryRouter><BookingFlow service={service} api={api} matching={{}} onBooked={jest.fn()}/></MemoryRouter>);
 fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
 expect(screen.getByRole('status')).toHaveTextContent('thời lượng dịch vụ đã chọn');expect(screen.getByRole('status')).toHaveTextContent('không tự cộng thêm phút');
});


test.each(['ngày','km'])('extended-play notice does not invent minutes for service unit %s',async unitLabel=>{
 const api=fixture();api.pets.mockResolvedValue({data:[{id:'pet',name:'Milo',species:'DOG',weightKg:4,traits:['extended-play']}]});
 render(<MemoryRouter><BookingFlow service={{...service,price:{unitLabel},details:{locations:['HOME']}}} api={api} matching={{}} onBooked={jest.fn()}/></MemoryRouter>);
 fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
 expect(screen.getByRole('status')).toHaveTextContent('thời lượng dịch vụ đã chọn');expect(screen.getByRole('status')).not.toHaveTextContent(/\d+ phút/);
});


test('returning Customer sees the complete direct directory automatically and cannot select an unavailable sitter', async () => {
  const api = fixture(); api.checkoutOptions.mockResolvedValue({ data: { recommendationAllowed: false } });
  api.availability.mockResolvedValue({ sitters: [
    { id: 'high', displayName: 'Điểm cao', rating: 4.9, reviewCount: 12, eligible: false, unavailableReason: 'OUTSIDE_WORKING_HOURS' },
    { id: 'lower', displayName: 'Có lịch phù hợp', rating: 4.5, reviewCount: 4, eligible: true, unavailableReason: null }
  ], complete: true, nextPage: null });
  const matching = { recommend: jest.fn() }; await chooseSchedule(api, matching);
  const radios = await screen.findAllByRole('radio', { name: /Điểm cao|Có lịch phù hợp/ });
  expect(radios[0]).toBeDisabled(); expect(radios[1]).not.toBeDisabled();
  expect(screen.getByText('4.9/5 · 12 đánh giá')).toBeVisible();
  expect(screen.queryByLabelText('Hệ thống đề xuất')).not.toBeInTheDocument();
  expect(screen.queryByText('Xem gợi ý cho lịch này')).not.toBeInTheDocument();
  expect(api.availability).toHaveBeenCalledTimes(1);
  expect(api.availability.mock.calls[0][0]).toMatchObject({ directory: true, page: 1 });
  fireEvent.click(radios[1]); await reviewAndConfirm();
  await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'DIRECT', requestedSitterId: 'lower' });
  expect(matching.recommend).not.toHaveBeenCalled();
});

test('direct directory retains earlier choices when loading more registered sitters', async () => {
  const api = fixture();
  api.availability.mockResolvedValueOnce({ sitters: [{ id: 'first', displayName: 'Trang một', rating: 5, reviewCount: 2, eligible: true }], complete: false, nextPage: 2 })
    .mockResolvedValueOnce({ sitters: [{ id: 'second', displayName: 'Chưa đánh giá', rating: null, reviewCount: 0, eligible: true }], complete: true, nextPage: null });
  await chooseSchedule(api); fireEvent.click(screen.getByLabelText('Chỉ định pet sitter'));
  const first = await screen.findByRole('radio', { name: /Trang một/ }); fireEvent.click(first);
  fireEvent.click(screen.getByText('Xem thêm sitter'));
  expect(await screen.findByRole('radio', { name: /Chưa đánh giá/ })).toBeVisible();
  expect(screen.getByRole('radio', { name: /Trang một/ })).toBeChecked();
  expect(api.availability.mock.calls[1][0]).toMatchObject({ page: 2 });
});


test('direct selection requires eligibility for every visit while still showing the registered sitter', async () => {
  const api = fixture();
  api.availability.mockResolvedValueOnce({ sitters: [{ id: 'same', displayName: 'Sitter nhiều buổi', rating: 4.8, reviewCount: 5, eligible: true }], complete: true, nextPage: null })
    .mockResolvedValueOnce({ sitters: [{ id: 'same', displayName: 'Sitter nhiều buổi', rating: 4.8, reviewCount: 5, eligible: false, unavailableReason: 'DAY_OFF' }], complete: true, nextPage: null });
  render(<MemoryRouter><BookingFlow service={service} api={api} matching={{}} onBooked={jest.fn()} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Milo · 4 kg'));
  fireEvent.change(screen.getByLabelText('Địa chỉ đã xác nhận'), { target: { value: 'address' } });
  fireEvent.change(screen.getByLabelText('Số buổi'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Buổi 1 (giờ Việt Nam)'), { target: { value: '2098-11-03T09:00' } });
  fireEvent.change(screen.getByLabelText('Buổi 2 (giờ Việt Nam)'), { target: { value: '2098-11-04T09:00' } });
  fireEvent.submit(screen.getByText('Tiếp tục').closest('form'));
  fireEvent.click(await screen.findByLabelText('Chỉ định pet sitter'));
  expect(await screen.findByRole('radio', { name: /Sitter nhiều buổi/ })).toBeDisabled();
  expect(screen.getByText('Nghỉ trong ngày đã chọn.')).toBeVisible();
  expect(screen.getByText('Xem lại đơn')).toBeDisabled();
  expect(api.confirm).not.toHaveBeenCalled();
});


test('returning Customer can book boarding through staff-arranged shifts without requesting AI advice', async () => {
  const api = fixture(), matching = { recommend: jest.fn() };
  api.checkoutOptions.mockResolvedValue({ data: { recommendationAllowed: false } });
  await chooseSchedule(api, matching, jest.fn(), { ...service, price: { unitLabel: 'ngày' } });
  expect(screen.getByLabelText('PawWorld sắp xếp')).toBeChecked();
  expect(screen.queryByText('Xem gợi ý cho lịch này')).not.toBeInTheDocument();
  await reviewAndConfirm(); await waitFor(() => expect(api.confirm).toHaveBeenCalled());
  expect(api.confirm.mock.calls[0][0].visits[0]).toMatchObject({ bookingMode: 'SYSTEM' });
  expect(api.confirm.mock.calls[0][0].visits[0]).not.toHaveProperty('matchId');
  expect(matching.recommend).not.toHaveBeenCalled();
  expect(api.availability).not.toHaveBeenCalled();
});
