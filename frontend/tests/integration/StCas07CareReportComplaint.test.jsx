import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookingVisitReport } from '../../src/components/common/BookingVisitReport.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const bookingId = 'b'.repeat(24);
const visitId = 'c'.repeat(24);
const base = '/account/bookings/' + bookingId;
const apiBase = '/api/v1/complaints';
const bookingEndpoint = '/api/v1/checkout/bookings/' + bookingId;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const reply = (data, status = 200) => ({
  status,
  ok: status < 400,
  json: async () => ({
    meta: { schemaVersion: 1, serverNow: '2026-11-28T06:00:00Z' },
    ...(status < 400 ? { data } : { error: data })
  })
});

test('ST-CAS-07 Care Report shows Send complaint and deadline for customer within 7 days (visit end, staff closed, incident result)', () => {
  const cases = [
    { state: 'COMPLETED', deadlineSource: 'VISIT_END', expectedCutoff: 'buổi kết thúc' },
    { state: 'STAFF_CLOSED', deadlineSource: 'VISIT_CLOSED', expectedCutoff: 'buổi được đóng' },
    { state: 'COMPLETED', deadlineSource: 'INCIDENT_RESULT', expectedCutoff: 'nhận kết quả sự cố' }
  ];
  for (const item of cases) {
    const { unmount } = render(
      <MemoryRouter>
        <BookingVisitReport
          visit={{ id: visitId, state: item.state, startAt: '2026-11-27T02:00:00Z', endAt: '2026-11-27T03:00:00Z' }}
          complaintAction={{
            to: `${base}/complaints/new?visit=${visitId}`,
            deadlineAt: '2026-12-04T03:00:00Z',
            deadlineSource: item.deadlineSource,
            visitState: item.state,
            eligible: true,
            reason: null
          }}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xem báo cáo và ảnh' }));
    const link = screen.getByRole('link', { name: 'Gửi khiếu nại' });
    expect(link).toHaveAttribute('href', `${base}/complaints/new?visit=${visitId}`);
    expect(screen.getByText(new RegExp(`10:00, 04/12/2026.*${item.expectedCutoff}`))).toBeVisible();
    unmount();
  }
});

test('ST-CAS-07 Care Report keeps Send complaint when open complaint exists within 7 days, hides after 7 days and for Staff', () => {
  const { rerender } = render(
    <MemoryRouter>
      <BookingVisitReport
        visit={{ id: visitId, state: 'COMPLETED' }}
        complaintAction={{
          to: `${base}/complaints/new?visit=${visitId}`,
          deadlineAt: '2026-12-04T03:00:00Z',
          deadlineSource: 'VISIT_END',
          eligible: false,
          reason: 'COMPLAINT_ALREADY_OPEN'
        }}
      />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Xem báo cáo và ảnh' }));
  expect(screen.getByRole('link', { name: 'Gửi khiếu nại' })).toBeVisible();
  expect(screen.getByText(/10:00, 04\/12\/2026/)).toBeVisible();

  rerender(
    <MemoryRouter>
      <BookingVisitReport
        visit={{ id: visitId, state: 'COMPLETED' }}
        complaintAction={{
          to: `${base}/complaints/new?visit=${visitId}`,
          deadlineAt: '2026-11-20T03:00:00Z',
          deadlineSource: 'VISIT_END',
          eligible: false,
          reason: 'COMPLAINT_WINDOW_EXPIRED'
        }}
      />
    </MemoryRouter>
  );
  expect(screen.queryByRole('link', { name: 'Gửi khiếu nại' })).toBeNull();

  rerender(
    <MemoryRouter>
      <BookingVisitReport visit={{ id: visitId, state: 'COMPLETED' }} />
    </MemoryRouter>
  );
  expect(screen.queryByRole('link', { name: 'Gửi khiếu nại' })).toBeNull();
});

test('ST-CAS-07 submitting a visit complaint shows it immediately as Open in My complaints and refreshes the list', async () => {
  const created = {
    id: 'new-complaint-id',
    code: 'KN-STCAS0700001',
    kind: 'COMPLAINT',
    scope: 'VISIT',
    bookingId,
    visitId,
    state: 'OPEN',
    version: 0,
    billState: 'ON_HOLD',
    createdAt: '2026-11-28T06:00:00Z',
    booking: { id: bookingId, code: 'BK-0042' },
    visit: { id: visitId, startAt: '2026-11-27T02:00:00Z' },
    evidenceRefs: []
  };
  let listCalls = 0;
  const eligibilityData = {
    booking: { id: bookingId, code: 'BK-0042', state: 'COMPLETED', version: 1, serviceName: 'Chăm sóc tại nhà' },
    wholeBooking: { eligible: true, aboveVisitTable: false, deadlineAt: '2026-12-04T03:00:00Z' },
    visits: [{
      id: visitId,
      version: 1,
      state: 'COMPLETED',
      startAt: '2026-11-27T02:00:00Z',
      endAt: '2026-11-27T03:00:00Z',
      serviceName: 'Chăm sóc tại nhà',
      sitterName: 'Sitter 01',
      canSubmit: true,
      eligibility: { eligible: true, reason: null, deadlineAt: '2026-12-04T03:00:00Z', deadlineSource: 'VISIT_END' }
    }]
  };

  globalThis.fetch = jest.fn(async (path, options) => {
    if (options?.method === 'POST' && path === apiBase) {
      return reply({ complaint: created, messageCode: 'MSG128' }, 201);
    }
    if (path === apiBase) {
      listCalls += 1;
      return reply({ items: listCalls === 1 ? [] : [created], nextCursor: null });
    }
    if (path === `${apiBase}/eligibility/bookings/${bookingId}`) {
      return reply(eligibilityData);
    }
    if (path === bookingEndpoint) {
      return reply({
        id: bookingId,
        state: 'COMPLETED',
        details: {
          terms: [],
          price: { visitCount: 1, visitPricesVnd: [150000], discountVnd: 0, totalVnd: 150000 },
          visits: [{ id: visitId, state: 'COMPLETED', startAt: '2026-11-27T02:00:00Z', endAt: '2026-11-27T03:00:00Z', sitterName: 'Sitter 01' }]
        }
      });
    }
    return reply({}, 404);
  });

  render(
    <MemoryRouter initialEntries={[`${base}/complaints/new?visit=${visitId}`]}>
      <SessionProvider
        adapter={{
          getCsrfToken: () => 'synthetic-csrf',
          resolve: async () => ({
            status: 'authenticated',
            user: { id: 'customer-01', roles: ['CUSTOMER'] },
            csrfToken: 'synthetic-csrf'
          })
        }}
      >
        <AppRoutes />
      </SessionProvider>
    </MemoryRouter>
  );

  fireEvent.change(await screen.findByRole('textbox', { name: /Điều chưa ổn/ }), { target: { value: 'Buổi kết thúc sớm.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi khiếu nại' }));

  expect(await screen.findByText(/Khiếu nại của bạn đã được gửi/)).toBeVisible();
  const card = await screen.findByRole('article', { name: 'KN-STCAS0700001' });
  expect(within(card).getByText('Đang mở')).toBeVisible();
  expect(within(card).getByText('Buổi 27/11/2026, 09:00')).toBeVisible();
  await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(2));
});
