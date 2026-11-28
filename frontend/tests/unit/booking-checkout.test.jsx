import { beforeAll } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookingCheckoutForm, BookingConfirmation, markBookingSavedToast } from '../../src/pages/public/BookingCheckout.jsx';
import { mobileRoutes } from '../../src/routes/mobile-route-metadata.js';
beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
const service = { id: 'service', name: 'Chăm sóc tại gia', details: { locations: ['HOME'] } };
const quote = { quoteId: 'quote', items: [{ serviceId: 'service', visitCount: 1, servicePolicy: { title: 'Điều kiện dịch vụ', body: 'Synthetic published policy' } }] };
const apiFixture = () => ({ addresses: jest.fn().mockResolvedValue({ data: [{ id: 'address', label: 'Nhà đã xác nhận' }] }),
  checkoutOptions: jest.fn().mockResolvedValue({ data: { facilityAddress: 'Synthetic facility' } }),
  confirm: jest.fn().mockResolvedValue({ id: 'booking' }), booking: jest.fn(), paymentLink: jest.fn() });

test('booking confirmation uses the saved quote and explicit Vietnam schedule, never browser amounts', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  try {
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
  } finally {
    jest.useRealTimers();
  }
});

test('unknown booking acknowledgement retains the same payload and key while schedule fields are frozen', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  try {
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
  } finally {
    jest.useRealTimers();
  }
});

test('checkout accepts only confirmed unavailable visits and reuses the last command after a timeout', async () => {
  const api = apiFixture();
  api.availability = jest.fn(async ({ visit }) => ({ sitters: [{ id: 'sitter', displayName: 'Sitter đã chăm',
    eligible: !visit.startAt.startsWith('2098-11-03'), unavailableReason: 'DAY_OFF' }] }));
  api.confirm.mockRejectedValueOnce({ status: 409, code: 'SITTER_AVAILABILITY_CONSENT_REQUIRED', lineFields: {
    1: { acceptUnavailableSitter: 'SLOT_UNAVAILABLE' }
  } }).mockRejectedValueOnce({ code: 'TIMEOUT' });
  const multiQuote = { ...quote, items: [{ ...quote.items[0], visitCount: 2 }] };
  render(<MemoryRouter><BookingCheckoutForm quote={multiQuote} services={[service]} api={api} onConfirmed={jest.fn()} /></MemoryRouter>);
  await screen.findAllByText('Nhà đã xác nhận');
  screen.getAllByLabelText('Bắt đầu (giờ Việt Nam)').forEach((el, i) => fireEvent.change(el, { target: { value: `2098-11-0${i + 3}T09:00` } }));
  screen.getAllByLabelText('Địa chỉ đã lưu').forEach(el => fireEvent.change(el, { target: { value: 'address' } }));
  (await screen.findAllByLabelText('Người chăm sóc mong muốn')).forEach(el => fireEvent.change(el, { target: { value: 'sitter' } }));
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
  const first = await screen.findByRole('dialog');
  expect(first).toHaveTextContent('Buổi 1');
  expect(first).not.toHaveTextContent('Buổi 2');
  expect(api.confirm).not.toHaveBeenCalled();
  fireEvent.click(within(first).getByRole('button', { name: 'Vẫn đặt lịch' }));
  await screen.findByText(/Buổi 2 \(2098/);
  const [initialBody, initialKey] = api.confirm.mock.calls[0];
  expect(initialBody.visits[0].acceptUnavailableSitter).toBe(true);
  expect(initialBody.visits[1]).not.toHaveProperty('acceptUnavailableSitter');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vẫn đặt lịch' }));
  await screen.findByText('Xác nhận lại');
  const [updatedBody, updatedKey] = api.confirm.mock.calls[1];
  expect(updatedBody.visits.map(visit => visit.acceptUnavailableSitter)).toEqual([true, true]);
  expect(updatedKey).not.toBe(initialKey);
  fireEvent.submit(screen.getByText('Xác nhận lại').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(3));
  expect(api.confirm.mock.calls[2]).toEqual([updatedBody, updatedKey]);
});

test('return URL reads actual unpaid state; a disabled provider never creates a fake payment link', async () => {
  const api = apiFixture(); api.booking.mockResolvedValue({ id: 'booking', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
    paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] });
  api.paymentLink.mockRejectedValue({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  render(<MemoryRouter initialEntries={['/services?booking=booking']}><BookingConfirmation api={api} /></MemoryRouter>);
  await screen.findByText('Chờ thanh toán trước'); fireEvent.click(screen.getByText('Tạo link thanh toán'));
  await screen.findByText(/Không thể mở trang thanh toán ngay lúc này/);
  expect(screen.queryByText('Thanh toán qua payOS')).toBeNull(); expect(api.booking).toHaveBeenCalledWith('booking', expect.any(Object));
});

test('expired booking has no payment command and displays MSG67', async () => {
  const api = apiFixture(); api.booking.mockResolvedValue({ id: 'booking', totalVnd: 120000, state: 'PAYMENT_EXPIRED', paymentState: 'UNPAID', paymentDeadlineAt: '2020-01-01', visits: [] });
  render(<MemoryRouter initialEntries={['/services?booking=booking']}><BookingConfirmation api={api} /></MemoryRouter>);
  await screen.findByText('Hết hạn thanh toán');
  expect(screen.getByText('Lịch đặt chưa được thanh toán trong 15 phút nên không còn được giữ. Vui lòng đặt lại.')).toBeVisible();
  expect(screen.queryByText('Tạo link thanh toán')).toBeNull();
});

test('ST-BKG-02 shows MSG31 toast once on paid return and does not replay on reload', async () => {
  window.sessionStorage.clear();
  const api = apiFixture();
  api.booking.mockResolvedValue({ id: 'booking-paid', totalVnd: 120000, state: 'DISPATCH_PENDING', paymentState: 'PAID', visits: [] });
  const { unmount } = render(<MemoryRouter initialEntries={['/account/bookings/booking-paid?payment=returned']}>
    <BookingConfirmation api={api} bookingId="booking-paid" />
  </MemoryRouter>);
  expect(await screen.findByText('Đã nhận thanh toán. Cảm ơn bạn!')).toBeVisible();
  expect(screen.queryByText(/MSG31|MSG32|MSG33/)).toBeNull();
  unmount();
  render(<MemoryRouter initialEntries={['/account/bookings/booking-paid?payment=returned']}>
    <BookingConfirmation api={api} bookingId="booking-paid" />
  </MemoryRouter>);
  await screen.findByText('Đã thanh toán');
  expect(screen.queryByText('Đã nhận thanh toán. Cảm ơn bạn!')).toBeNull();
});

test('ST-BKG-02 shows pending confirmation notice when returned from payOS before webhook completes', async () => {
  window.sessionStorage.clear();
  const api = apiFixture();
  api.booking.mockResolvedValue({ id: 'booking-pending', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] });
  render(<MemoryRouter initialEntries={['/account/bookings/booking-pending?payment=returned']}>
    <BookingConfirmation api={api} bookingId="booking-pending" />
  </MemoryRouter>);
  expect(await screen.findByText('Đang chờ xác nhận thanh toán từ payOS. Nếu bạn vừa thanh toán, hãy bấm cập nhật trạng thái đơn sau ít giây.')).toBeVisible();
  expect(screen.queryByText('Đã nhận thanh toán. Cảm ơn bạn!')).toBeNull();
});

test('ST-BKG-16 shows inline MSG32 without code suffix on cancelled return and keeps payment button usable', async () => {
  window.sessionStorage.clear();
  const api = apiFixture();
  api.booking.mockResolvedValue({ id: 'booking-cancel', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] });
  render(<MemoryRouter initialEntries={['/account/bookings/booking-cancel?payment=cancelled']}>
    <BookingConfirmation api={api} bookingId="booking-cancel" />
  </MemoryRouter>);
  expect(await screen.findByText('Thanh toán chưa thành công. Vui lòng thử lại.')).toBeVisible();
  expect(screen.queryByText(/\(MSG32\)|\(MSG33\)/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Tạo link thanh toán' })).toBeEnabled();
});

test('recommended checkout freezes the selected service schedule and carries only the match reference', async () => {
  const api = apiFixture();
  const recommendation = { matchId: 'match', requestedSitterId: 'sitter', displayName: 'Sitter đã chọn', addressId: 'address', startAt: '2026-11-03T02:00:00Z' };
  render(<MemoryRouter><BookingCheckoutForm quote={quote} services={[service]} api={api} onConfirmed={jest.fn()} recommendation={recommendation} /></MemoryRouter>);
  await screen.findByText('Nhà đã xác nhận');
  expect(screen.getByLabelText('Bắt đầu (giờ Việt Nam)')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Địa chỉ đã lưu')).toBeDisabled();
  expect(screen.getByLabelText('Địa chỉ đã lưu')).toHaveValue('address');
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  expect(api.confirm.mock.calls[0][0].visits).toEqual([{ itemIndex: 0, location: 'HOME', addressId: 'address', startAt: recommendation.startAt, requestedSitterId: 'sitter', matchId: 'match' }]);
});


test('explicit account detail id loads the owned order and presents recognizable service and pet names', async () => {
  const api = apiFixture(); api.booking.mockResolvedValue({ id: 'saved-order', state: 'DISPATCH_PENDING', totalVnd: 120000,
    visits: [{ id: 'visit', serviceName: 'Cắt móng', petNames: ['Milo'], startAt: '2026-11-12T02:00:00Z', location: 'HOME', serviceAddress: 'Địa chỉ đã đặt' }], careShifts: [], scheduleProposals: [] });
  render(<MemoryRouter><BookingConfirmation api={api} bookingId="saved-order" /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Cắt móng' })).toBeVisible();
  expect(screen.getByText('Buổi 1 · Milo')).toBeVisible();
  expect(screen.getByText('Đã xác nhận')).toBeVisible();
  expect(api.booking).toHaveBeenCalledWith('saved-order', expect.any(Object));
});

test('ST-BKG-21: empty address link points to /account/addresses and sitter recommendations mobile route M16 is hidden', async () => {
  const api = apiFixture();
  api.addresses.mockResolvedValue({ data: [] });
  render(<MemoryRouter><BookingCheckoutForm quote={quote} services={[service]} api={api} onConfirmed={jest.fn()} /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: 'Thêm địa chỉ chăm sóc' });
  expect(link).toHaveAttribute('href', '/account/addresses');
  expect(mobileRoutes.some(row => row.path === '/account/sitter-recommendations' || row.id === 'M16')).toBe(false);
});

test('ST-BKG-12: allows 01/12 08:00 to 31/12 18:00 and blocks 01/12 08:00 to 01/01 07:00 with MSG20', async () => {
  const api = apiFixture(), confirmed = jest.fn();
  const twoVisitQuote = { ...quote, items: [{ ...quote.items[0], visitCount: 2, durationMinutes: 60 }] };
  render(<MemoryRouter><BookingCheckoutForm quote={twoVisitQuote} services={[service]} api={api} onConfirmed={confirmed} /></MemoryRouter>);
  await screen.findAllByText('Nhà đã xác nhận');
  const startInputs = screen.getAllByLabelText('Bắt đầu (giờ Việt Nam)');
  screen.getAllByLabelText('Địa chỉ đã lưu').forEach(el => fireEvent.change(el, { target: { value: 'address' } }));
  fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));

  fireEvent.change(startInputs[0], { target: { value: '2026-12-01T08:00' } });
  fireEvent.change(startInputs[1], { target: { value: '2027-01-01T07:00' } });
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
  expect(await screen.findByText('Một lịch đặt kéo dài tối đa 30 ngày.')).toBeVisible();
  expect(api.confirm).not.toHaveBeenCalled();

  fireEvent.change(startInputs[1], { target: { value: '2026-12-31T18:00' } });
  fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  expect(api.confirm.mock.calls[0][0].visits.map(v => v.startAt)).toEqual([
    '2026-12-01T08:00:00+07:00',
    '2026-12-31T18:00:00+07:00'
  ]);
  expect(confirmed).toHaveBeenCalledWith({ id: 'booking' });
});

test('ST-BKG-02 and ST-BKG-16 display Đã xác nhận with dispatch subtitle for paid DISPATCH_PENDING bookings', async () => {
  window.sessionStorage.clear();
  const api = apiFixture();
  api.booking
    .mockResolvedValueOnce({ id: 'booking-retry', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] })
    .mockResolvedValueOnce({ id: 'booking-retry', totalVnd: 120000, state: 'DISPATCH_PENDING', paymentState: 'PAID', visits: [] });
  render(<MemoryRouter initialEntries={['/account/bookings/booking-retry?payment=cancelled']}>
    <BookingConfirmation api={api} bookingId="booking-retry" />
  </MemoryRouter>);
  expect(await screen.findByText('Thanh toán chưa thành công. Vui lòng thử lại.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cập nhật trạng thái đơn' }));
  expect(await screen.findByText('Đã xác nhận')).toBeVisible();
  expect(screen.getByText('PawWorld đang gửi lời mời. Bạn sẽ được thông báo khi sitter nhận ca.')).toBeVisible();
  expect(screen.queryByText('Chờ người chăm sóc')).not.toBeInTheDocument();
});

test('ST-BKG-11 validates home visit under 2 hours in BookingCheckoutForm with MSG19 under date/time field and maps server error', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-28T03:00:00Z'));
  try {
    const api = apiFixture();
    api.confirm.mockRejectedValueOnce({ code: 'HOME_BOOKING_NOTICE_REQUIRED', status: 422 });
    render(<MemoryRouter><BookingCheckoutForm quote={quote} services={[service]} api={api} onConfirmed={jest.fn()} /></MemoryRouter>);
    await screen.findByText('Nhà đã xác nhận');
    const startInput = screen.getByLabelText('Bắt đầu (giờ Việt Nam)');
    expect(startInput).not.toHaveAttribute('min');
    fireEvent.change(startInput, { target: { value: '2026-11-28T11:00' } });
    fireEvent.change(screen.getByLabelText('Địa chỉ đã lưu'), { target: { value: 'address' } });
    fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));
    fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
    const fieldContainer = startInput.closest('.pwc-booking-daytime');
    expect(within(fieldContainer).getByText('Vui lòng đặt lịch trước ít nhất 2 giờ.')).toBeVisible();
    expect(api.confirm).not.toHaveBeenCalled();

    fireEvent.change(startInput, { target: { value: '2026-11-28T12:30' } });
    fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
    expect(await within(fieldContainer).findByText('Vui lòng đặt lịch trước ít nhất 2 giờ.')).toBeVisible();
  } finally {
    jest.useRealTimers();
  }
});

test('A1 / GBR-09: non-HOME visit in BookingCheckoutForm enforces 2-hour notice with MSG19 under date/time and maps BOOKING_NOTICE_REQUIRED', async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-11-28T03:00:00Z'));
  try {
    const api = apiFixture(), confirmed = jest.fn();
    api.confirm
      .mockRejectedValueOnce({ code: 'BOOKING_NOTICE_REQUIRED', status: 422, lineFields: { 0: { startAt: 'BOOKING_NOTICE_REQUIRED' } } })
      .mockResolvedValueOnce({ id: 'booking' });
    const outdoorService = { id: 'dog-walking', name: 'Dắt chó đi dạo', details: { locations: ['OUTDOOR'] } };
    const outdoorQuote = {
      quoteId: 'quote-outdoor', paymentMode: 'PREPAY',
      items: [{ serviceId: 'dog-walking', visitCount: 1, durationMinutes: 30, servicePolicy: { title: 'Điều kiện dịch vụ', body: 'Synthetic published policy' } }]
    };
    render(<MemoryRouter><BookingCheckoutForm quote={outdoorQuote} services={[outdoorService]} api={api} onConfirmed={confirmed} /></MemoryRouter>);
    await screen.findByText('Nhà đã xác nhận');
    const startInput = screen.getByLabelText('Bắt đầu (giờ Việt Nam)');
    fireEvent.change(startInput, { target: { value: '2026-11-28T11:00' } });
    fireEvent.change(screen.getByLabelText('Địa chỉ đã lưu'), { target: { value: 'address' } });
    fireEvent.click(screen.getByLabelText('Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.'));
    fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
    const fieldContainer = startInput.closest('.pwc-booking-daytime');
    expect(within(fieldContainer).getByText('Vui lòng đặt lịch trước ít nhất 2 giờ.')).toBeVisible();
    expect(api.confirm).not.toHaveBeenCalled();

    fireEvent.change(startInput, { target: { value: '2026-11-28T12:00' } });
    fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
    expect(await within(fieldContainer).findByText('Vui lòng đặt lịch trước ít nhất 2 giờ.')).toBeVisible();

    fireEvent.change(startInput, { target: { value: '2026-11-28T12:30' } });
    fireEvent.submit(screen.getByText('Xác nhận đặt dịch vụ').closest('form'));
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2));
    expect(confirmed).toHaveBeenCalledWith({ id: 'booking' });
  } finally {
    jest.useRealTimers();
  }
});

test('A3 / ST-BKG-41: shows MSG22 toast once right after saving an AWAITING_PAYMENT booking and does not replay on reopen', async () => {
  window.sessionStorage.clear();
  const api = apiFixture();
  api.booking.mockResolvedValue({
    id: 'booking-saved', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
    paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: []
  });
  markBookingSavedToast('booking-saved');
  const { unmount } = render(<MemoryRouter initialEntries={['/account/bookings/booking-saved']}>
    <BookingConfirmation api={api} bookingId="booking-saved" />
  </MemoryRouter>);
  const toast = await screen.findByText('Lịch đặt đã được lưu. Vui lòng thanh toán trong 15 phút để xác nhận.');
  expect(toast).toBeVisible();
  expect(toast.closest('.pwc-booking-toast')).toHaveAttribute('role', 'status');
  unmount();

  render(<MemoryRouter initialEntries={['/account/bookings/booking-saved']}>
    <BookingConfirmation api={api} bookingId="booking-saved" />
  </MemoryRouter>);
  await screen.findByText('Chờ thanh toán trước');
  expect(screen.queryByText('Lịch đặt đã được lưu. Vui lòng thanh toán trong 15 phút để xác nhận.')).toBeNull();
});

test.each([
  ['reopened without saved flag', false, '/account/bookings/b1', { id: 'b1', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] }],
  ['already PAID', true, '/account/bookings/b2', { id: 'b2', totalVnd: 120000, state: 'DISPATCH_PENDING', paymentState: 'PAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] }],
  ['PAYMENT_EXPIRED', true, '/account/bookings/b3', { id: 'b3', totalVnd: 120000, state: 'PAYMENT_EXPIRED', paymentState: 'UNPAID', paymentDeadlineAt: '2020-01-01T00:00:00Z', visits: [] }],
  ['payment=returned', true, '/account/bookings/b4?payment=returned', { id: 'b4', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] }],
  ['payment=cancelled', true, '/account/bookings/b5?payment=cancelled', { id: 'b5', totalVnd: 120000, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: '2099-01-01T00:00:00Z', visits: [] }]
])('A3 / ST-BKG-41: does not show MSG22 toast when %s', async (_label, setFlag, route, booking) => {
  window.sessionStorage.clear();
  const api = apiFixture();
  api.booking.mockResolvedValue(booking);
  if (setFlag) markBookingSavedToast(booking.id);
  render(<MemoryRouter initialEntries={[route]}>
    <BookingConfirmation api={api} bookingId={booking.id} />
  </MemoryRouter>);
  await screen.findByText(`Mã tra cứu: ${booking.id}`);
  expect(screen.queryByText('Lịch đặt đã được lưu. Vui lòng thanh toán trong 15 phút để xác nhận.')).toBeNull();
});
