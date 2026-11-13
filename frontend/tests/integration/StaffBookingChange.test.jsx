import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const bookingId = '6af6837addad30d9548707bb';
const requestId = '6af6837bddad30d9548707d8';
const visitId = '6af6837addad30d9548707d2';
const base = '/api/v1/staff/booking-change-requests';
const bookingPath = '/api/v1/staff/bookings/' + bookingId;
const sentAt = '2026-11-04T00:12:00.000Z';
const request = {
  id: requestId, bookingId, bookingCode: 'BK-0042', customerName: 'Trần Thị Lan',
  state: 'PENDING', scope: 'VISIT', version: 2, sentAt, expiresAt: '2026-11-07T04:00:00.000Z',
  items: [{ visitId, oldStartAt: '2026-11-07T10:00:00.000Z', oldEndAt: '2026-11-07T10:30:00.000Z',
    newStartAt: '2026-11-07T11:00:00.000Z', newEndAt: '2026-11-07T11:30:00.000Z',
    sitterName: 'Lê Văn Minh', availability: 'AVAILABLE', priceVnd: 90000 }]
};
const originalFetch = globalThis.fetch;
beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { globalThis.fetch = originalFetch; });

function response(data, status = 200) {
  return { ok: status < 400, status, json: async () => status < 400
    ? { data, meta: { schemaVersion: 1 } } : { error: data } };
}

function show({ detail = {}, respond, role = 'STAFF', dispatch = false } = {}) {
  let state = 'PENDING';
  globalThis.fetch = jest.fn(async (path, init) => {
    if (path === '/api/v1/employee-scheduling/dispatch') return response({ items: [] });
    if (path === bookingPath) {
      const visit = request.items[0];
      const moved = state === 'APPROVED';
      return response({ id: bookingId, customerName: request.customerName, state: 'ASSIGNED',
        paymentMode: 'POSTPAY', paymentState: 'UNPAID', details: { terms: [], visits: [{
          id: visitId, startAt: moved ? visit.newStartAt : visit.oldStartAt, endAt: moved ? visit.newEndAt : visit.oldEndAt,
          sitterName: visit.sitterName, state: 'ASSIGNED'
        }], price: { visitPricesVnd: [90000] } } });
    }
    if (path.startsWith(base + '?')) return response({ items: state === 'PENDING' ? [request] : [], nextCursor: null });
    if (path === base + '/' + requestId) return response({ ...request, state, serverNow: sentAt, ...detail });
    if (path === base + '/' + requestId + '/decision') {
      if (respond) {
        const errorResponse = await respond();
        if (errorResponse) return errorResponse;
      }
      const { action } = JSON.parse(init.body);
      state = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      return response({ id: requestId, bookingId, state, messageCode: action === 'APPROVE' ? 'MSG126' : 'MSG127' });
    }
    return response({ code: 'RESOURCE_NOT_FOUND' }, 404);
  });
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'staff', roles: [role] } }),
    getCsrfToken: () => 'synthetic-csrf' };
  render(<MemoryRouter initialEntries={[dispatch ? '/staff/dispatch' : '/staff/bookings/' + bookingId]}>
    <SessionProvider adapter={adapter}><AppRoutes /></SessionProvider>
  </MemoryRouter>);
}

async function openRequest() {
  fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Yêu cầu đổi giờ' }));
  await dialog.findByText('Đổi cho');
  return dialog;
}

function decisions() {
  return globalThis.fetch.mock.calls.filter(([path]) => path.endsWith('/decision')).map(([, init]) => init);
}

test('UC-85 approves the selected request, shows MSG126 and reads the updated booking', async () => {
  show();
  const dialog = await openRequest();
  expect(dialog.getByText('Chờ duyệt')).toBeVisible();
  expect(dialog.getByText('Rảnh giờ mới')).toBeVisible();
  expect(dialog.getByText(/Hết hạn lúc 11:00, 07\/11\/2026/)).toBeVisible();
  fireEvent.click(dialog.getByRole('button', { name: 'Duyệt' }));
  expect(await screen.findByText(/Đã lưu giờ mới/)).toBeVisible();
  expect(await screen.findByText('18:00 – 18:30')).toBeVisible();
  const [command] = decisions();
  expect(JSON.parse(command.body)).toEqual({ action: 'APPROVE', expectedVersion: 2 });
  expect(command.headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
  expect(command.headers.get('Idempotency-Key')).toBeTruthy();
});

test('UC-85 rejects and shows MSG127 while the visit keeps the old time', async () => {
  show({ detail: { items: [{ ...request.items[0], availability: 'BUSY' }] } });
  const dialog = await openRequest();
  expect(dialog.getByText('Bận giờ mới')).toBeVisible();
  fireEvent.click(dialog.getByRole('button', { name: 'Từ chối' }));
  expect(await screen.findByText('Đã từ chối yêu cầu. Buổi giữ giờ cũ.')).toBeVisible();
  expect(screen.getByText('17:00 – 17:30')).toBeVisible();
});

test.each([
  [{ code: 'MSG151', reasonCode: 'PET_OVERLAP' }, 422, /thú cưng đã có lịch khác vào giờ đó/],
  [{ code: 'BOOKING_CHANGE_VISIT_CHANGED' }, 409, 'Buổi đã thay đổi sau khi khách gửi yêu cầu. Vui lòng từ chối yêu cầu.'],
  [{ code: 'BOOKING_CHANGE_NOT_PENDING', state: 'EXPIRED' }, 409, /Yêu cầu đã hết hạn/]
])('UC-85 shows the decision error %j in the dialog', async (error, status, expected) => {
  show({ respond: () => response(error, status) });
  const dialog = await openRequest();
  fireEvent.click(dialog.getByRole('button', { name: 'Duyệt' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(expected);
  if (error.code === 'BOOKING_CHANGE_VISIT_CHANGED') {
    expect(dialog.getByRole('button', { name: 'Duyệt' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Từ chối' })).toBeEnabled();
  }
  if (error.state === 'EXPIRED') expect(dialog.queryByRole('button', { name: 'Duyệt' })).toBeNull();
});

test('UC-85 opening an expired request shows the terminal state and offers no decision', async () => {
  show({ detail: { state: 'EXPIRED' } });
  const dialog = await openRequest();
  expect(dialog.getByText('Đã hết hạn')).toBeVisible();
  expect(dialog.queryByRole('button', { name: 'Duyệt' })).toBeNull();
  expect(dialog.queryByRole('button', { name: 'Từ chối' })).toBeNull();
});

test('UC-85 checks an uncertain decision using the same key and version', async () => {
  let count = 0;
  show({ respond: () => { if (++count === 1) throw new Error('Disconnected'); } });
  const dialog = await openRequest();
  fireEvent.click(dialog.getByRole('button', { name: 'Duyệt' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('Chưa nhận được xác nhận');
  fireEvent.click(dialog.getByRole('button', { name: 'Kiểm tra lại yêu cầu' }));
  expect(await screen.findByText(/Đã lưu giờ mới/)).toBeVisible();
  const [first, second] = decisions();
  expect(second.body).toBe(first.body);
  expect(second.headers.get('Idempotency-Key')).toBe(first.headers.get('Idempotency-Key'));
});

test.each(['STAFF', 'ADMIN'])('UC-85 opens the request in Cần xử lý as %s', async role => {
  show({ role, dispatch: true });
  const row = await screen.findByRole('row', { name: /BK-0042.*Yêu cầu đổi giờ chờ duyệt/ });
  expect(row).toBeVisible();
  const dialog = await openRequest();
  fireEvent.click(dialog.getByRole('button', { name: 'Duyệt' }));
  expect(await screen.findByText(/Đã lưu giờ mới/)).toBeVisible();
  expect(screen.queryByRole('row', { name: /Yêu cầu đổi giờ chờ duyệt/ })).toBeNull();
});
