import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const bookingId = 'b'.repeat(24), visitId = 'c'.repeat(24), bookedVisitId = 'd'.repeat(24);
const base = '/account/bookings/' + bookingId;
const apiBase = '/api/v1/complaints';
const bookingEndpoint = '/api/v1/checkout/bookings/' + bookingId;
const paymentDeadlineAt = '2026-11-10T00:00:00Z';
const overdueBooking = { id: bookingId, state: 'OVERDUE', totalVnd: 120000, paymentDeadlineAt,
  visits: [
    { id: bookedVisitId, serviceName: 'Dắt chó đi dạo', startAt: '2026-11-10T00:00:00Z' },
    { id: 'cancelled', serviceName: 'Dắt chó đi dạo', startAt: '2026-11-10T01:00:00Z' }
  ], careShifts: [], scheduleProposals: [] };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const eligibility = (whole = true) => ({
  booking: { id: bookingId, code: 'BK-0042', state: 'OVERDUE', version: 1, serviceName: 'Dắt chó đi dạo' },
  wholeBooking: { eligible: whole, aboveVisitTable: false, deadlineAt: '2026-11-17T00:00:00Z' },
  visits: [
    { id: visitId, customerVisitId: bookedVisitId, version: 2, state: 'COMPLETED',
      startAt: '2026-11-10T00:00:00Z', endAt: '2026-11-10T00:30:00Z',
      serviceName: 'Dắt chó đi dạo', sitterName: 'Lê Văn Minh',
      canSubmit: true, eligibility: { eligible: false, reason: 'COMPLAINT_ALREADY_OPEN' } },
    { id: 'cancelled', state: 'CANCELLED', canSubmit: false, eligibility: { eligible: false } }
  ]
});
const resultItem = (id, code, state, extra = {}) => ({
  id, code, state, bookingId, kind: 'COMPLAINT', scope: 'VISIT', visitId, version: 1, billState: 'ON_HOLD',
  createdAt: '2026-11-10T12:00:00Z', visit: { startAt: '2026-11-10T00:00:00Z' },
  evidenceRefs: [], ...extra
});
const reply = (data, status = 200) => ({ status, ok: status < 400,
  json: async () => ({ meta: { schemaVersion: 1, serverNow: '2026-11-12T00:00:00Z' }, ...(status < 400 ? { data } : { error: data }) }) });

function show(path, overrides = {}, role = 'CUSTOMER') {
  const rules = {
    [apiBase + '/eligibility/bookings/' + bookingId]: () => reply(eligibility()),
    [apiBase]: () => reply({ items: [], nextCursor: null }),
    [bookingEndpoint]: () => reply(overdueBooking),
    ...overrides
  };
  globalThis.fetch = jest.fn(async (path, options) => {
    const key = options.method === 'POST' ? 'POST ' + path : path;
    return rules[key]?.(options) ?? reply({}, 404);
  });
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={{ getCsrfToken: () => 'synthetic-csrf', resolve: async () => ({
    status: 'authenticated', user: { id: 'synthetic', roles: [role] }, csrfToken: 'synthetic-csrf'
  }) }}><AppRoutes /></SessionProvider></MemoryRouter>);
}

test('UC-27 renders eligibility per visit and preserves Overdue and payment deadline', async () => {
  const read = jest.fn().mockImplementationOnce(() => reply(overdueBooking))
    .mockImplementation(() => reply({ ...overdueBooking, state: 'COMPLETED' }));
  const data = eligibility();
  data.booking.state = 'COMPLETED';
  data.visits.splice(1, 0, { id: 'second-shift', customerVisitId: bookedVisitId, state: 'IN_PROGRESS',
    canSubmit: false, startAt: '2026-11-10T01:00:00Z' });
  show(base, { [bookingEndpoint]: read, [apiBase + '/eligibility/bookings/' + bookingId]: () => reply(data) });
  const link = await screen.findByRole('link', { name: 'Gửi khiếu nại' });
  expect(link).toHaveAttribute('href', base + '/complaints/new?visit=' + visitId);
  const confirmation = screen.getByRole('button', { name: 'Cập nhật trạng thái đơn' }).closest('section');
  const visitList = within(confirmation).getByRole('list');
  const [completed, cancelled] = within(visitList).getAllByRole('listitem');
  expect(completed).toContainElement(link);
  expect(within(completed).getByText('Đã hoàn tất')).toBeVisible();
  expect(within(completed).getByText('Đang chăm sóc')).toBeVisible();
  expect(within(cancelled).getByText('Đã hủy')).toBeVisible();
  expect(within(cancelled).queryByRole('link', { name: 'Gửi khiếu nại' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Các buổi chăm sóc' })).toBeNull();
  expect(await screen.findByText('Quá hạn', { exact: true })).toBeVisible();
  expect(screen.getByText('Hạn thanh toán: 07:00, 10/11/2026')).toBeVisible();
  expect(confirmation.parentElement).toHaveClass('customer-booking-detail__confirmation--overdue');
  expect(screen.queryByText('Hóa đơn đang chờ', { exact: true })).not.toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cập nhật trạng thái đơn' }));
  expect(await screen.findByText('Đã hoàn tất', { exact: true, selector: '.pwc-booking-current-status' })).toBeVisible();
  expect(screen.queryByText('Quá hạn', { exact: true })).toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
});

test('UC-52 uses whole-booking scope, submits the short form and shows MSG128', async () => {
  const complaint = resultItem('new-case', 'KN-AAA000BBB111', 'OPEN', { scope: 'BOOKING', visitId: null });
  const submit = jest.fn(() => reply({ complaint, messageCode: 'MSG128' }, 201));
  show(base + '/complaints/new?visit=' + visitId, { ['POST ' + apiBase]: submit });
  const description = await screen.findByRole('textbox', { name: /Điều chưa ổn/ });
  expect(description).toHaveAttribute('maxLength', '1000');
  expect(screen.getByRole('radio', { name: 'Buổi này (10/11, 07:00)' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'Cả lịch đặt BK-0042' })).toBeChecked();
  expect(screen.getByText('Bạn gửi được khiếu nại đến 07:00, 17/11/2026 (7 ngày sau khi lịch đặt kết thúc). Mỗi buổi chỉ có một khiếu nại đang mở.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi khiếu nại' }));
  expect(await screen.findByText('Trường này là bắt buộc.')).toBeVisible();
  fireEvent.change(description, { target: { value: 'Bơ về nhà bị dính bùn.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi khiếu nại' }));
  expect(await screen.findByText(/Khiếu nại của bạn đã được gửi/)).toBeVisible();
  const request = submit.mock.calls[0][0];
  expect(JSON.parse(request.body)).toMatchObject({ scope: 'BOOKING', bookingId, description: 'Bơ về nhà bị dính bùn.', expectedVersion: 1 });
  expect(JSON.parse(request.body)).not.toHaveProperty('visitId');
});

test.each([
  ['COMPLETED', 'buổi kết thúc'],
  ['STAFF_CLOSED', 'buổi được đóng']
])('UC-52 shows the server deadline for an eligible %s visit', async (state, cutoff) => {
  const data = eligibility();
  data.visits[0] = { ...data.visits[0], state, eligibility: { eligible: true, deadlineAt: '2026-11-17T17:05:00Z' } };
  show(base + '/complaints/new?visit=' + visitId, { [apiBase + '/eligibility/bookings/' + bookingId]: () => reply(data) });
  expect(await screen.findByRole('radio', { name: 'Buổi này (10/11, 07:00)' })).toBeChecked();
  expect(screen.getByText(/Thứ Ba, 10\/11\/2026 · 07:00 – 07:30/)).toBeVisible();
  expect(screen.getByText('Bạn gửi được khiếu nại đến 00:05, 18/11/2026 (7 ngày sau khi ' + cutoff +
    '). Mỗi buổi chỉ có một khiếu nại đang mở.')).toBeVisible();
  expect(screen.getByText('Khi khiếu nại chưa có kết quả cuối, hoá đơn của lịch đặt được giữ lại.')).toBeVisible();
  expect(screen.queryByText(/Lịch đã quá hạn/)).toBeNull();
});

test('UC-52 notification link opens a complaint outside the first page and keeps other case labels', async () => {
  const item = resultItem('selected', 'KN-ABCDEF123456', 'RESOLVED', { isFinal: true, customerResult: 'Kết quả cho Bơ', approvedAmountVnd: 0 });
  show(base + '/complaints/new?complaint=selected', {
    [apiBase + '/selected']: () => reply(item),
    [apiBase]: () => reply({ items: [
      resultItem('open', 'KN-111111111111', 'OPEN'),
      resultItem('resolved', 'KN-222222222222', 'RESOLVED', { scope: 'BOOKING', booking: { code: 'BK-0042' } }),
      resultItem('escalated', 'KN-333333333333', 'ESCALATED')
    ] })
  });
  const selected = await screen.findByRole('article', { name: 'KN-ABCDEF123456' });
  expect(selected).toHaveAttribute('aria-current', 'true');
  expect(within(selected).getByText('Kết quả cuối')).toBeVisible();
  expect(within(selected).getByText(/0\s*₫/)).toBeVisible();
  expect(screen.getByText('Đang mở')).toBeVisible();
  expect(screen.getByText('Đã có kết quả')).toBeVisible();
  expect(screen.getByText('Chuyển quản trị')).toBeVisible();
  expect(within(selected).getByText('Buổi 10/11/2026, 07:00')).toBeVisible();
  expect(screen.getByText('Lịch đặt BK-0042', { exact: true })).toBeVisible();
});


test.each([
  ['COMPLAINT_WINDOW_EXPIRED', /Chỉ có thể gửi khiếu nại trong 7 ngày/],
  ['COMPLAINT_ALREADY_OPEN', /Bạn đã có khiếu nại đang mở/]
])('UC-52 shows R3 submit error %s', async (code, message) => {
  show(base + '/complaints/new?visit=' + visitId, { ['POST ' + apiBase]: () => reply({ code }, 409) });
  fireEvent.change(await screen.findByRole('textbox', { name: /Điều chưa ổn/ }), { target: { value: 'Nội dung' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi khiếu nại' }));
  expect(await screen.findByText(message)).toBeVisible();
});

test('UC-52 shows one objection only before the server deadline', async () => {
  const item = resultItem('resolved', 'KN-222222222222', 'RESOLVED', {
    customerResult: 'Kết quả', objection: { allowed: true, count: 0, deadlineAt: '2026-11-12T12:00:00Z' }
  });
  const late = resultItem('expired', 'KN-333333333333', 'RESOLVED', {
    customerResult: 'Kết quả cũ', objection: { allowed: true, count: 0, deadlineAt: '2026-11-11T12:00:00Z' }
  });
  const object = jest.fn(() => reply({ complaint: { ...item, version: 2, state: 'ESCALATED', objection: { allowed: false } }, messageCode: 'MSG129' }));
  show(base + '/complaints/new?visit=' + visitId, {
    [apiBase]: () => reply({ items: [item, late] }),
    ['POST ' + apiBase + '/resolved/objections']: object
  });
  const row = await screen.findByRole('article', { name: item.code });
  expect(within(row).getByText('Không đồng ý được đến 19:00, 12/11/2026.')).toBeVisible();
  expect(within(screen.getByRole('article', { name: late.code })).queryByRole('button', { name: 'Không đồng ý' })).toBeNull();
  fireEvent.click(within(row).getByRole('button', { name: 'Không đồng ý' }));
  fireEvent.click(within(row).getByRole('button', { name: 'Gửi lý do' }));
  expect(within(row).getByText('Trường này là bắt buộc.')).toBeVisible();
  fireEvent.change(within(row).getByRole('textbox', { name: /Lý do/ }), { target: { value: 'Báo cáo còn thiếu.' } });
  fireEvent.click(within(row).getByRole('button', { name: 'Gửi lý do' }));
  expect(await screen.findByText('Đã gửi lý do không đồng ý đến quản trị viên.')).toBeVisible();
  expect(within(row).getByText('Chuyển quản trị')).toBeVisible();
  expect(within(row).queryByRole('button', { name: 'Không đồng ý' })).toBeNull();
  expect(object).toHaveBeenCalledTimes(1);
});

test('UC-27 offers only a booking complaint above an all-cancelled schedule with eligible bill', async () => {
  const data = eligibility();
  data.wholeBooking.aboveVisitTable = true;
  data.visits = [{ id: 'cancelled', state: 'CANCELLED', canSubmit: false, eligibility: { eligible: false } }];
  show(base, { [apiBase + '/eligibility/bookings/' + bookingId]: () => reply(data) });
  const link = await screen.findByRole('link', { name: 'Gửi khiếu nại' });
  expect(link).toHaveAttribute('href', base + '/complaints/new');
  const confirmation = screen.getByRole('button', { name: 'Cập nhật trạng thái đơn' }).closest('section');
  expect(confirmation).toContainElement(link);
  expect(within(confirmation).getByRole('list')).not.toContainElement(link);
});

test('UC-52 route blocks operational sessions', async () => {
  show(base + '/complaints/new?visit=' + visitId, {}, 'STAFF');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

 test('ambiguous submit freezes draft and retries the identical command', async () => {
  const complaint = resultItem('retry-case', 'KN-RETRY', 'OPEN', { scope: 'BOOKING', visitId: null });
  const submit = jest.fn().mockRejectedValueOnce(new Error('synthetic network')).mockImplementationOnce(() => reply({ complaint }, 201));
  show(base + '/complaints/new?visit=' + visitId, { ['POST ' + apiBase]: submit });
  const description = await screen.findByRole('textbox', { name: /Điều chưa ổn/ });
  fireEvent.change(description, { target: { value: 'Nội dung gốc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi khiếu nại' }));
  const retry = await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu' });
  expect(description).toBeDisabled();
  expect(screen.getByLabelText('Thêm ảnh')).toBeDisabled();
  fireEvent.click(retry);
  expect(await screen.findByText(/Khiếu nại của bạn đã được gửi/)).toBeVisible();
  expect(submit.mock.calls[1][0].body).toBe(submit.mock.calls[0][0].body);
  expect(submit.mock.calls[1][0].headers.get('Idempotency-Key')).toBe(submit.mock.calls[0][0].headers.get('Idempotency-Key'));
 });
 test('ambiguous objection freezes reason and retries the identical command', async () => {
  const item = resultItem('resolved', 'KN-RETRY-OBJECTION', 'RESOLVED', { objection: { allowed: true, count: 0, deadlineAt: '2026-11-12T12:00:00Z' } });
  const submit = jest.fn().mockRejectedValueOnce(new Error('synthetic network')).mockImplementationOnce(() => reply({ complaint: { ...item, version: 2, state: 'ESCALATED', objection: { allowed: false } } }));
  show(base + '/complaints/new', { [apiBase]: () => reply({ items: [item] }), ['POST ' + apiBase + '/resolved/objections']: submit });
  fireEvent.click(await screen.findByRole('button', { name: 'Không đồng ý' }));
  const reason = screen.getByRole('textbox', { name: /Lý do/ });
  fireEvent.change(reason, { target: { value: 'Lý do gốc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lý do' }));
  const retry = await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu' });
  expect(reason).toBeDisabled();
  fireEvent.click(retry);
  expect(await screen.findByText('Đã gửi lý do không đồng ý đến quản trị viên.')).toBeVisible();
  expect(submit.mock.calls[1][0].body).toBe(submit.mock.calls[0][0].body);
  expect(submit.mock.calls[1][0].headers.get('Idempotency-Key')).toBe(submit.mock.calls[0][0].headers.get('Idempotency-Key'));
 });

test('shared booking detail keeps complaint action on its operational visit row', async () => {
 const details={terms:[],visits:[{id:visitId,state:'COMPLETED',startAt:'2026-11-10T00:00:00Z',endAt:'2026-11-10T00:30:00Z',sitterName:'Synthetic sitter'}],price:{visitCount:1,visitPricesVnd:[120000],discountVnd:0,totalVnd:120000}};
 const data=eligibility();data.visits[0].canSubmit=true;data.visits[0].eligibility.eligible=true;
 show(base,{[bookingEndpoint]:()=>reply({...overdueBooking,details}),[apiBase+'/eligibility/bookings/'+bookingId]:()=>reply(data)});
 const link=await screen.findByRole('link',{name:'Gửi khiếu nại'});
 const row=link.closest('tr');expect(row).not.toBeNull();expect(within(row).getByText('Synthetic sitter')).toBeVisible();
 expect(link).toHaveAttribute('href',base+'/complaints/new?visit='+visitId);
});
