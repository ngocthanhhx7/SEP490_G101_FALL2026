import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { CustomerBookingDetailPage } from '../../src/pages/customer/CustomerBookingDetailPage.jsx';
import { StaffBookingDetailPage } from '../../src/pages/staff/StaffBookingDetailPage.jsx';

const bookingId = '6b047c55e0b45d5aa4513c01';
const visitActiveId = '6b047c55e0b45d5aa4513d01';
const visitCancelledId = '6b047c55e0b45d5aa4513d02';

function jsonReply(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => ({ data, meta: { schemaVersion: 1 } })
  };
}

function bookingPayload({ state = 'ASSIGNED', visits = [
  { id: visitActiveId, startAt: '2026-11-26T02:00:00.000Z', endAt: '2026-11-26T03:00:00.000Z', state: 'ASSIGNED', sitterName: 'Nguyễn An' },
  { id: visitCancelledId, startAt: '2026-11-27T02:00:00.000Z', endAt: '2026-11-27T03:00:00.000Z', state: 'CANCELLED', sitterName: null }
] } = {}) {
  return {
    id: bookingId,
    state,
    paymentMode: 'POSTPAY',
    paymentState: 'UNPAID',
    visits: [],
    details: {
      consentAt: '2026-11-24T01:00:00.000Z',
      terms: [{
        serviceName: 'Chăm sóc tại gia',
        durationMinutes: 60,
        serviceAddress: '12 Cầu Giấy, Hà Nội',
        areaName: 'Cầu Giấy',
        startAt: '2026-11-26T02:00:00.000Z',
        endAt: '2026-11-26T03:00:00.000Z',
        petNames: ['Milo'],
        careRequirements: []
      }],
      visits,
      price: { visitCount: visits.length, visitPricesVnd: [150000], discountVnd: 0, orderFeeVnd: 0, totalVnd: 150000 * visits.length }
    }
  };
}

function mountCustomer(routes) {
  globalThis.fetch = jest.fn(async url => {
    const path = String(url).replace(/^\/api\/v1/, '');
    const reply = routes[path];
    return reply ? reply() : jsonReply({}, 404);
  });
  return render(
    <MemoryRouter initialEntries={[`/account/bookings/${bookingId}`]}>
      <SessionProvider adapter={{
        getCsrfToken: () => 'csrf-token',
        resolve: async () => ({ status: 'authenticated', user: { id: 'cust-1', roles: ['CUSTOMER'] }, csrfToken: 'csrf-token' })
      }}>
        <Routes>
          <Route path="/account/bookings/:bookingId" element={<CustomerBookingDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>
  );
}

describe('Customer Booking Details actions column (UC-27, UC-78)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('renders Theo dõi buổi, Đổi giờ, Gửi khiếu nại in order and hides actions for cancelled visits', async () => {
    mountCustomer({
      [`/checkout/bookings/${bookingId}`]: () => jsonReply(bookingPayload()),
      [`/bookings/${bookingId}/change-options`]: () => jsonReply({
        bookingId,
        canChangeBooking: true,
        serverNow: '2026-11-24T02:00:00.000Z',
        slotNumbers: [1, 2],
        visits: [{
          id: visitActiveId,
          customerVisitId: visitActiveId,
          startAt: '2026-11-26T02:00:00.000Z',
          endAt: '2026-11-26T03:00:00.000Z',
          canSelect: true,
          keepsOldTime: false
        }]
      }),
      [`/complaints/eligibility/bookings/${bookingId}`]: () => jsonReply({
        booking: { id: bookingId, state: 'ASSIGNED' },
        wholeBooking: { eligible: false, aboveVisitTable: false },
        visits: [
          { id: visitActiveId, customerVisitId: visitActiveId, state: 'COMPLETED', canSubmit: true, startAt: '2026-11-26T02:00:00.000Z' },
          { id: visitCancelledId, customerVisitId: visitCancelledId, state: 'CANCELLED', canSubmit: false, startAt: '2026-11-27T02:00:00.000Z' }
        ]
      })
    });

    const table = await screen.findByRole('table', { name: 'Các buổi chăm sóc' });
    expect(within(table).getByRole('columnheader', { name: 'Thao tác' })).toBeVisible();
    const scheduleLink = screen.getByRole('link', { name: 'Xem cả 2 buổi' });
    expect(scheduleLink).toHaveAttribute('href', `/account/bookings/${bookingId}/visits`);

    const rows = within(table).getAllByRole('row');
    const activeCells = within(rows[1]).getAllByRole('cell');
    const actionCell = activeCells.at(-1);
    const trackLink = within(actionCell).getByRole('link', { name: 'Theo dõi buổi' });
    const changeButton = await within(actionCell).findByRole('button', { name: /Đổi giờ/ });
    const complaintLink = await within(actionCell).findByRole('link', { name: 'Gửi khiếu nại' });

    expect(trackLink).toHaveAttribute('href', `/account/bookings/${bookingId}/visits/${visitActiveId}`);
    expect(trackLink.compareDocumentPosition(changeButton) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(changeButton.compareDocumentPosition(complaintLink) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const cancelledCell = within(rows[2]).getAllByRole('cell').at(-1);
    expect(within(cancelledCell).queryByRole('link', { name: 'Theo dõi buổi' })).toBeNull();
    expect(within(cancelledCell).queryByRole('button', { name: /Đổi giờ/ })).toBeNull();
    expect(within(cancelledCell).queryByRole('link', { name: 'Gửi khiếu nại' })).toBeNull();
  });

  test('hides Theo dõi buổi and the Thao tác column when the entire booking is cancelled', async () => {
    mountCustomer({
      [`/checkout/bookings/${bookingId}`]: () => jsonReply(bookingPayload({
        state: 'CANCELLED',
        visits: [{ id: visitActiveId, startAt: '2026-11-26T02:00:00.000Z', endAt: '2026-11-26T03:00:00.000Z', state: 'ASSIGNED', sitterName: 'Nguyễn An' }]
      })),
      [`/bookings/${bookingId}/change-options`]: () => jsonReply({
        bookingId,
        canChangeBooking: false,
        serverNow: '2026-11-24T02:00:00.000Z',
        slotNumbers: [1, 2],
        visits: []
      }),
      [`/complaints/eligibility/bookings/${bookingId}`]: () => jsonReply({
        booking: { id: bookingId, state: 'CANCELLED' },
        wholeBooking: { eligible: false, aboveVisitTable: false },
        visits: []
      })
    });

    const table = await screen.findByRole('table', { name: 'Các buổi chăm sóc' });
    expect(within(table).queryByRole('columnheader', { name: 'Thao tác' })).toBeNull();
    expect(within(table).queryByRole('link', { name: 'Theo dõi buổi' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Xem cả .* buổi/ })).toBeNull();
  });

  test('does not render Xem cả N buổi when a customer booking has only one visit', async () => {
    mountCustomer({
      [`/checkout/bookings/${bookingId}`]: () => jsonReply(bookingPayload({
        state: 'ASSIGNED',
        visits: [{ id: visitActiveId, startAt: '2026-11-26T02:00:00.000Z', endAt: '2026-11-26T03:00:00.000Z', state: 'ASSIGNED', sitterName: 'Nguyễn An' }]
      })),
      [`/bookings/${bookingId}/change-options`]: () => jsonReply({
        bookingId,
        canChangeBooking: false,
        serverNow: '2026-11-24T02:00:00.000Z',
        slotNumbers: [1, 2],
        visits: []
      }),
      [`/complaints/eligibility/bookings/${bookingId}`]: () => jsonReply({
        booking: { id: bookingId, state: 'ASSIGNED' },
        wholeBooking: { eligible: false, aboveVisitTable: false },
        visits: []
      })
    });

    await screen.findByRole('table', { name: 'Các buổi chăm sóc' });
    expect(screen.queryByRole('link', { name: /Xem cả .* buổi/ })).toBeNull();
  });

  test('does not render Theo dõi buổi, Thao tác column or Xem cả N buổi on Staff Booking Details', async () => {
    globalThis.fetch = jest.fn(async () => jsonReply(bookingPayload()));
    render(
      <MemoryRouter initialEntries={[`/staff/bookings/${bookingId}`]}>
        <SessionProvider adapter={{
          getCsrfToken: () => 'csrf-token',
          resolve: async () => ({ status: 'authenticated', user: { id: 'staff-1', roles: ['STAFF'] }, csrfToken: 'csrf-token' })
        }}>
          <Routes>
            <Route path="/staff/bookings/:bookingId" element={<StaffBookingDetailPage />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );

    const table = await screen.findByRole('table', { name: 'Các buổi chăm sóc' });
    expect(within(table).queryByRole('columnheader', { name: 'Thao tác' })).toBeNull();
    expect(within(table).queryByRole('link', { name: 'Theo dõi buổi' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Xem cả .* buổi/ })).toBeNull();
  });
});
