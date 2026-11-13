import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const bookingId = 'a'.repeat(24);
const serverNow = '2026-11-04T00:12:00.000Z';
const serviceName = 'Dắt chó đi dạo';
const sampleVisits = [
  { id: 'b'.repeat(24), slotNumber: 2, startAt: '2026-11-04T10:00:00.000Z', endAt: '2026-11-04T10:30:00.000Z',
    canSelect: false, keepsOldTime: true },
  { id: 'c'.repeat(24), slotNumber: 1, startAt: '2026-11-07T00:00:00.000Z', endAt: '2026-11-07T00:30:00.000Z',
    canSelect: true, keepsOldTime: false },
  { id: 'd'.repeat(24), slotNumber: 2, startAt: '2026-11-07T10:00:00.000Z', endAt: '2026-11-07T10:30:00.000Z',
    canSelect: true, keepsOldTime: false }
].map(visit => ({ ...visit, sitterName: 'Lê Văn Minh', serviceName, priceVnd: 90000, customerVisitId: null }));
const eligibleOptions = { bookingId, bookingCode: 'BK-0042', serverNow, canChangeBooking: true,
  slotNumbers: [1, 2], visits: sampleVisits };
const optionsPath = '/api/v1/bookings/' + bookingId + '/change-options';
const submitPath = '/api/v1/bookings/' + bookingId + '/change-requests';
const originalFetch = globalThis.fetch;

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { globalThis.fetch = originalFetch; });

function response(data, status = 200) {
  return { ok: status < 400, status, json: async () => status < 400
    ? { data, meta: { schemaVersion: 1 } } : { error: data, meta: { schemaVersion: 1 } } };
}

function show({ options = eligibleOptions, submit = () => response({
  id: 'e'.repeat(24), bookingId, state: 'PENDING', messageCode: 'MSG53'
}, 201) } = {}) {
  globalThis.fetch = jest.fn(async (path, request) => {
    if (path === '/api/v1/checkout/bookings/' + bookingId) return response({
      id: bookingId, state: 'IN_PROGRESS', paymentMode: 'POSTPAY', paymentState: 'UNPAID', totalVnd: 270000,
      visits: [], careShifts: [], scheduleProposals: [],
      details: { terms: [{ serviceName, petNames: [], careRequirements: [], startAt: '2026-11-03T00:00:00.000Z' },
        { serviceName, petNames: [], careRequirements: [], startAt: sampleVisits[2].startAt }],
      visits: sampleVisits.map(visit => ({ ...visit, state: 'ASSIGNED', evidence: [] })),
      price: { visitCount: 3, visitPricesVnd: [90000], discountVnd: 0, totalVnd: 270000 } }
    });
    if (path === '/api/v1/complaints/eligibility/bookings/' + bookingId) return response({
      booking: { id: bookingId }, visits: [], wholeBooking: { eligible: false }
    });
    if (path === optionsPath) return response(options);
    if (path === submitPath) return submit(request);
    return response({ code: 'RESOURCE_NOT_FOUND' }, 404);
  });
  const adapter = {
    resolve: async () => ({ status: 'authenticated', user: { id: 'customer', displayName: 'Trần Thị Lan', roles: ['CUSTOMER'] } }),
    getCsrfToken: () => 'synthetic-csrf'
  };
  render(<MemoryRouter initialEntries={['/account/bookings/' + bookingId]}>
    <SessionProvider adapter={adapter}><AppRoutes /></SessionProvider>
  </MemoryRouter>);
}

async function openSingle() {
  fireEvent.click(await screen.findByRole('button', { name: /Đổi giờ buổi .*17:00.*Lê Văn Minh/ }));
  return within(await screen.findByRole('dialog', { name: 'Gửi yêu cầu đổi giờ' }));
}

function submitSingle(dialog) {
  fireEvent.change(dialog.getByLabelText(/Giờ mới/), { target: { value: '18:00' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Gửi yêu cầu' }));
}

function submitted() {
  return globalThis.fetch.mock.calls.filter(([path]) => path === submitPath).map(([, request]) => request);
}

test('UC-84 opens the selected visit, hides the near visit action and submits Vietnam time', async () => {
  show();
  const dialog = await openSingle();
  expect(screen.queryByRole('button', { name: /Đổi giờ buổi .*04\/11\/2026/, hidden: true })).toBeNull();
  expect(dialog.getByText('Lịch đặt BK-0042 · Dắt chó đi dạo · 03/11/2026 – 07/11/2026')).toBeVisible();
  expect(dialog.getByLabelText(/Buổi cần đổi/)).toHaveValue(sampleVisits[2].id);
  expect(dialog.getByText('Giá không đổi: 90.000 đ mỗi buổi.')).toBeVisible();
  submitSingle(dialog);
  expect(await screen.findByText('Đã gửi yêu cầu đổi giờ. Bạn sẽ được báo khi nhân viên trả lời.')).toBeVisible();
  expect(screen.queryByRole('dialog', { name: 'Gửi yêu cầu đổi giờ' })).toBeNull();
  const [request] = submitted();
  expect(JSON.parse(request.body)).toEqual({ scope: 'VISIT', visitId: sampleVisits[2].id, startAt: '2026-11-07T18:00:00+07:00' });
  expect(request.headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
  expect(request.headers.get('Idempotency-Key')).toBeTruthy();
});

test('UC-84 whole booking identifies the unchanged visit and sends times in slot order', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Đổi giờ cho cả lịch đặt' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Gửi yêu cầu đổi giờ' }));
  expect(dialog.getByText(/Giữ giờ cũ/)).toBeVisible();
  expect(dialog.getByText(/04\/11\/2026.*17:00.*Lê Văn Minh/)).toBeVisible();
  fireEvent.change(dialog.getByLabelText(/Ngày đầu mới/), { target: { value: '2026-11-08' } });
  fireEvent.change(dialog.getByLabelText(/Giờ mới buổi 1/), { target: { value: '08:00' } });
  fireEvent.change(dialog.getByLabelText(/Giờ mới buổi 2/), { target: { value: '18:00' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Gửi yêu cầu' }));
  await waitFor(() => expect(submitted()).toHaveLength(1));
  expect(JSON.parse(submitted()[0].body)).toEqual({ scope: 'BOOKING', firstDay: '2026-11-08', times: ['08:00', '18:00'] });
});

test('UC-84 hides both change entry points when boarding options are unavailable', async () => {
  show({ options: { ...eligibleOptions, canChangeBooking: false, slotNumbers: [], visits: [] } });
  expect(await screen.findByRole('heading', { name: 'Thông tin lịch đặt' })).toBeVisible();
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(optionsPath, expect.anything()));
  expect(screen.queryByRole('button', { name: /Đổi giờ/ })).toBeNull();
});

test.each([
  ['MSG148', { time: '2026-11-07T00:30:00.000Z' }, 'Buổi 2 phải bắt đầu từ 07:30, khi buổi 1 kết thúc.'],
  ['MSG54', {}, 'Gửi yêu cầu trước giờ cũ ít nhất 12 giờ, cho giờ mới cách bây giờ ít nhất 24 giờ.'],
  ['MSG55', {}, 'Buổi này đã được đổi giờ một lần và không thể đổi lại.'],
  ['MSG149', {}, 'Buổi này đã có yêu cầu đổi giờ đang chờ nhân viên duyệt.'],
  ['BOOKING_CHANGE_STAFF_PROPOSAL_PENDING', {}, 'Buổi này đang có đề xuất đổi giờ của nhân viên chờ bạn xác nhận.'],
  ['MSG20', {}, 'Một lịch đặt kéo dài tối đa 30 ngày.'],
  ['MSG150', {}, 'Mỗi ngày có tối đa hai buổi thuộc lịch đặt này.'],
  ['MSG68', { pet: 'Milo' }, 'Milo đã có lịch đặt khác vào giờ này.']
])('UC-84 displays %s inline without closing the dialog', async (code, fields, message) => {
  show({ submit: () => response({ code, ...fields }, 422) });
  const dialog = await openSingle();
  submitSingle(dialog);
  expect(await dialog.findByRole('alert')).toHaveTextContent(message);
  expect(dialog.getByLabelText(/Giờ mới/)).toHaveValue('18:00');
});

test('UC-84 retries an uncertain send with the same payload and idempotency key', async () => {
  let attempts = 0;
  show({ submit: () => {
    if (++attempts === 1) throw new Error('connection lost after sending');
    return response({ id: 'e'.repeat(24), bookingId, state: 'PENDING', messageCode: 'MSG53' }, 201);
  } });
  const dialog = await openSingle();
  submitSingle(dialog);
  expect(await dialog.findByRole('alert')).toHaveTextContent('Chưa nhận được xác nhận');
  expect(dialog.getByLabelText(/Giờ mới/)).toBeDisabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Kiểm tra lại yêu cầu' }));
  expect(await screen.findByText('Đã gửi yêu cầu đổi giờ. Bạn sẽ được báo khi nhân viên trả lời.')).toBeVisible();
  const [first, second] = submitted();
  expect(second.body).toBe(first.body);
  expect(second.headers.get('Idempotency-Key')).toBe(first.headers.get('Idempotency-Key'));
});
