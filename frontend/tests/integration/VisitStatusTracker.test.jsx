import { beforeAll } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const bookingId = '6af6837addad30d9548707bb';
const visitId = '6af6837addad30d9548707d8';
const path = '/account/bookings/' + bookingId + '/visits/' + visitId;
const tracker = '/api/v1/bookings/' + bookingId + '/visits/' + visitId + '/tracker';
const time = clock => '2026-11-04T' + clock + ':00+07:00';
const phases = [
  { key: 'ASSIGNED', at: '2026-11-03T20:15:00+07:00', reached: true },
  { key: 'ARRIVED', at: time('06:58'), reached: true },
  { key: 'IN_PROGRESS', at: time('07:03'), reached: true },
  { key: 'FINISHED', at: null, reached: false },
  { key: 'REPORT_READY', at: null, reached: false }
];
const active = { asOf: time('07:12'),
  booking: { id: bookingId, code: 'BK-0042', visitNumber: 3, visitCount: 10 },
  visit: { id: visitId, status: 'IN_PROGRESS', showProgress: true, startAt: time('07:00'), endAt: time('07:30'),
    serviceName: 'Dắt chó đi dạo', durationMinutes: 30, address: '12 Nguyễn Trãi',
    pets: [{ name: 'Milo', breed: 'Corgi' }, { name: 'Bơ', breed: 'Poodle' }] },
  milestones: phases, updates: phases.slice(0, 3).reverse().map(({ key, at }) => ({ key, at })),
  sitter: { name: 'Lê Văn Minh', rating: 4.8 },
  actions: { profile: false, walkLocation: { eligible: true, available: false }, incident: false, careReport: false }
};
const done = { ...active, asOf: time('07:31'), visit: { ...active.visit, status: 'REPORT_READY' },
  milestones: phases.map((phase, index) => index < 3 ? phase : { ...phase, at: time('07:30'), reached: true }),
  actions: { ...active.actions, careReport: true }
};
const originalFetch = globalThis.fetch;
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'customer', roles: ['CUSTOMER'] } }) };
const envelope = data => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data }) });
beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
  else delete document.hidden;
  jest.useRealTimers();
});
function show(getTracker) {
  globalThis.fetch = jest.fn(async url => {
    if (url === tracker) return envelope(await getTracker());
    if (url === '/api/v1/checkout/bookings/' + bookingId)
      return envelope({ id: bookingId, state: 'IN_PROGRESS', paymentMode: 'POSTPAY', paymentState: 'UNPAID',
        visits: [], careShifts: [], scheduleProposals: [], details: { terms: [], price: { visitPricesVnd: [] },
          visits: [{ ...active.visit, state: 'COMPLETED', sitterName: 'Lê Văn Minh',
            checklist: [{ itemId: 'one', label: 'Dắt Milo đi dạo', status: 'DONE' }] }] } });
    return { ok: false, status: 404, json: async () => ({ error: { code: 'RESOURCE_NOT_FOUND' } }) };
  });
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={adapter}><AppRoutes /></SessionProvider></MemoryRouter>);
}
const reads = () => globalThis.fetch.mock.calls.filter(([url]) => url === tracker).length;

test('UC-78 renders current progress and newest updates and returns to the booking', async () => {
  show(() => active);
  expect(await screen.findByRole('heading', { name: 'Theo dõi buổi chăm sóc' })).toBeVisible();
  const progress = screen.getByRole('region', { name: 'Tiến trình buổi' });
  const steps = within(progress).getAllByRole('listitem');
  expect(steps).toHaveLength(5);
  expect(steps[2]).toHaveAttribute('aria-current', 'step');
  expect(steps[2]).toHaveTextContent('07:03');
  const updates = within(screen.getByRole('region', { name: 'Cập nhật trong buổi' })).getAllByRole('listitem');
  expect(updates[0]).toHaveTextContent('07:03');
  expect(updates[2]).toHaveTextContent('20:15');
  expect(screen.getByText('Milo (Corgi), Bơ (Poodle)')).toBeVisible();
  expect(screen.queryByText(/Xem hồ sơ người chăm sóc|Xem vị trí đi dạo|Báo sự cố/)).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Quay lại Lịch đặt BK-0042' }));
  expect(await screen.findByRole('heading', { name: 'Chi tiết đơn chăm sóc' })).toBeVisible();
});

test('UC-78 shows finding a sitter in place of the steps', async () => {
  show(() => ({ ...active, sitter: null, visit: { ...active.visit, status: 'FINDING_SITTER', showProgress: false },
    updates: [] }));
  expect((await screen.findAllByText('Đang tìm người')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Đã nhận')).toBeNull();
});

test('UC-78 checks again when visible and stops after the report is ready', async () => {
  jest.useFakeTimers();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  let current = active;
  show(() => current);
  await screen.findByRole('heading', { name: 'Theo dõi buổi chăm sóc' });
  expect(reads()).toBe(1);
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect(reads()).toBe(2);
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  fireEvent(document, new window.Event('visibilitychange'));
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(reads()).toBe(2);
  current = done;
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  fireEvent(document, new window.Event('visibilitychange'));
  expect(await screen.findByRole('button', { name: 'Xem báo cáo và ảnh' })).toBeVisible();
  expect(reads()).toBe(3);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(reads()).toBe(3);
  fireEvent.click(screen.getByRole('button', { name: 'Xem báo cáo và ảnh' }));
  expect(await screen.findByText('Dắt Milo đi dạo')).toBeVisible();
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Báo cáo buổi chăm sóc' })).toBeVisible());
});
