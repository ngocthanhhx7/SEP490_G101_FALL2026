import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const originalFetch = globalThis.fetch;
const bookingId = 'a'.repeat(24);
const visitId = 'b'.repeat(24);
const nextVisitId = 'c'.repeat(24);
const snapshotId = 'd'.repeat(24);
const detailPath = '/account/bookings/' + bookingId;
const bookingPath = '/api/v1/checkout/bookings/' + bookingId;
const visitPath = detailPath + '/visits/' + visitId;
const trackerPath = '/api/v1/bookings/' + bookingId + '/visits/' + visitId + '/tracker';
const serviceName = 'Dắt chó đi dạo';
const first = {
  id: visitId, state: 'ASSIGNED', startAt: '2026-11-03T00:00:00Z', endAt: '2026-11-03T00:30:00Z',
  sitterName: 'Lê Văn Minh'
};
const next = { id: nextVisitId, state: 'SCHEDULED', startAt: '2026-11-07T00:00:00Z', endAt: '2026-11-07T00:30:00Z' };
const snapshot = { id: snapshotId, state: 'SCHEDULED', serviceName, petNames: ['Milo'], startAt: first.startAt };
const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: ['CUSTOMER'] } }) };

afterEach(() => { globalThis.fetch = originalFetch; });

function makeBooking(visits = [first, next]) {
  return {
    id: bookingId, state: 'CONFIRMED', paymentMode: 'PREPAY', paymentState: 'PAID', totalVnd: 180000,
    visits: [snapshot], careShifts: [], scheduleProposals: [],
    details: {
      terms: [{ serviceName, petNames: ['Milo', 'Bơ'], careRequirements: [] }], visits,
      price: { visitCount: visits.length, visitPricesVnd: [90000], discountVnd: 0, totalVnd: 180000 }
    }
  };
}

function response(data, status = 200) {
  return { ok: status === 200, status, json: async () => ({
    meta: { schemaVersion: 1 }, ...(status === 200 ? { data } : { error: data })
  }) };
}

function show({ readBooking = makeBooking, changeVisits = [], complaintVisits = [] } = {}) {
  globalThis.fetch = jest.fn(async path => {
    if (path === bookingPath) return response(readBooking());
    if (path === '/api/v1/bookings/' + bookingId + '/change-options') return response({
      bookingId, bookingCode: 'BK-0042', serverNow: '2026-11-01T00:00:00Z',
      canChangeBooking: false, slotNumbers: [1], visits: changeVisits
    });
    if (path === '/api/v1/complaints/eligibility/bookings/' + bookingId) return response({
      booking: { id: bookingId }, wholeBooking: { eligible: false }, visits: complaintVisits
    });
    if (path === trackerPath) return response({
      booking: { id: bookingId, code: 'BK-0042', visitNumber: 1, visitCount: 2 },
      asOf: '2026-11-03T00:05:00Z',
      visit: { id: visitId, status: 'ASSIGNED', showProgress: true,
        serviceName, startAt: first.startAt, endAt: first.endAt, pets: [{ name: 'Milo' }, { name: 'Bơ' }] },
      milestones: ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'FINISHED', 'REPORT_READY']
        .map((key, index) => ({ key, reached: index === 0, at: index === 0 ? first.startAt : null })),
      updates: [], sitter: null, actions: { careReport: false }
    });
    return response({ code: 'RESOURCE_NOT_FOUND' }, 404);
  });
  render(<MemoryRouter initialEntries={[detailPath]}><SessionProvider adapter={adapter}><AppRoutes /></SessionProvider></MemoryRouter>);
}

async function visitTable() {
  return within(await screen.findByRole('table', { name: 'Các buổi chăm sóc' }));
}

test('UC-78 displays Thao tác without change options and links each row by its operational ID', async () => {
  show();
  const table = await visitTable();
  expect(table.getByRole('columnheader', { name: 'Thao tác' })).toBeVisible();
  const firstRow = within(table.getByRole('row', { name: /03\/11/ }));
  const nextRow = within(table.getByRole('row', { name: /07\/11/ }));
  expect(firstRow.getByRole('link', { name: 'Theo dõi buổi' })).toHaveAttribute('href', visitPath);
  expect(nextRow.getByRole('link', { name: 'Theo dõi buổi' })).toHaveAttribute('href', detailPath + '/visits/' + nextVisitId);
  expect(table.queryByRole('button', { name: /^Đổi giờ buổi/ })).toBeNull();
});

test('UC-78 keeps the row actions in tracking, change, complaint order', async () => {
  show({
    changeVisits: [{ ...first, customerVisitId: snapshotId, canSelect: true, keepsOldTime: false }],
    complaintVisits: [{ ...first, customerVisitId: snapshotId, canSubmit: true }]
  });
  const table = await visitTable();
  const row = within(table.getByRole('row', { name: /03\/11/ }));
  await row.findByRole('link', { name: 'Gửi khiếu nại' });
  const actionsCell = row.getAllByRole('cell').at(-1);
  const actions = within(actionsCell);
  const change = await actions.findByRole('button', { name: /^Đổi giờ buổi/ });
  const tracker = actions.getByRole('link', { name: 'Theo dõi buổi' });
  const complaint = actions.getByRole('link', { name: 'Gửi khiếu nại' });
  expect([...actionsCell.querySelectorAll('a, button')]).toEqual([tracker, change, complaint]);
  expect(complaint).toHaveAttribute('href', detailPath + '/complaints/new?visit=' + visitId);
});

test.each([
  ['a cancelled visit', { ...first, state: 'CANCELLED' }],
  ['a visit without an ID', { ...first, id: undefined }],
  ['a visit with an invalid ID', { ...first, id: 'not-an-object-id' }]
])('UC-78 hides tracking for %s without hiding other visit links', async (_label, visit) => {
  show({ readBooking: () => makeBooking([visit, next]) });
  const table = await visitTable();
  expect(within(table.getByRole('row', { name: /03\/11/ })).queryByRole('link', { name: 'Theo dõi buổi' })).toBeNull();
  expect(within(table.getByRole('row', { name: /07\/11/ })).getByRole('link', { name: 'Theo dõi buổi' })).toBeVisible();
});

test('UC-78 hides tracking for every row of a cancelled booking', async () => {
  show({ readBooking: () => ({ ...makeBooking(), state: 'CANCELLED' }) });
  const table = await visitTable();
  expect(table.getAllByRole('row')).toHaveLength(3);
  expect(table.queryByRole('link', { name: 'Theo dõi buổi' })).toBeNull();
});

test('UC-78 omits tracking from the fallback list even if the snapshot ID looks valid', async () => {
  show({ readBooking: () => ({ ...makeBooking(), details: undefined }) });
  expect(await screen.findByRole('heading', { name: 'Lịch chăm sóc đã đặt' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Theo dõi buổi' })).toBeNull();
});

test('UC-78 opens the selected tracker and returns to the same booking', async () => {
  show();
  const table = await visitTable();
  const row = within(table.getByRole('row', { name: /03\/11/ }));
  expect(globalThis.fetch).not.toHaveBeenCalledWith(trackerPath, expect.anything());
  fireEvent.click(row.getByRole('link', { name: 'Theo dõi buổi' }));
  expect(await screen.findByRole('heading', { name: 'Theo dõi buổi chăm sóc' })).toBeVisible();
  expect(globalThis.fetch).toHaveBeenCalledWith(trackerPath, expect.objectContaining({ credentials: 'same-origin' }));
  const back = screen.getByRole('link', { name: 'Quay lại Lịch đặt BK-0042' });
  expect(back).toHaveAttribute('href', detailPath);
  fireEvent.click(back);
  expect((await visitTable()).getAllByRole('link', { name: 'Theo dõi buổi' })[0]).toHaveAttribute('href', visitPath);
});

test.each([
  ['the same visit is rescheduled', visitId],
  ['the care plan replaces the operational visit', nextVisitId]
])('UC-78 uses the refreshed operational ID when %s', async (_label, refreshedId) => {
  let booking = makeBooking([first]);
  show({ readBooking: () => booking });
  expect((await visitTable()).getByRole('link', { name: 'Theo dõi buổi' })).toHaveAttribute('href', visitPath);
  booking = makeBooking([{ ...first, id: refreshedId, startAt: '2026-11-03T01:00:00Z', endAt: '2026-11-03T01:30:00Z' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Cập nhật trạng thái đơn' }));
  const table = await visitTable();
  expect(await table.findByRole('cell', { name: '08:00 – 08:30' })).toBeVisible();
  expect(table.getByRole('link', { name: 'Theo dõi buổi' })).toHaveAttribute('href', detailPath + '/visits/' + refreshedId);
});
