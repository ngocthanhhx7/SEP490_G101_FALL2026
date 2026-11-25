import { beforeAll, afterEach, test, expect, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const bookingId = 'f'.repeat(24);
const visitStartedId = '1'.repeat(24);
const visitUpcoming1Id = '2'.repeat(24);
const visitUpcoming2Id = '3'.repeat(24);
const serverNow = '2026-11-26T02:00:00.000Z';
const originalFetch = globalThis.fetch;

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(data, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => (status < 400
      ? { data, meta: { schemaVersion: 1 } }
      : { error: data, meta: { schemaVersion: 1 } })
  };
}

function renderDetail({ visits, bookingState = 'DISPATCH_PENDING', refunds = [], previewHandler, cancelHandler }) {
  let currentBooking = {
    id: bookingId,
    state: bookingState,
    paymentMode: 'PREPAY',
    paymentState: 'PAID',
    totalVnd: 349200,
    visits: [],
    careShifts: [],
    scheduleProposals: [],
    details: {
      terms: [{ serviceName: 'Chăm sóc tại gia', petNames: ['Bông'], careRequirements: [], startAt: visits[0]?.startAt }],
      visits,
      price: { visitCount: visits.length, visitPricesVnd: [120000], discountVnd: 10800, orderFeeVnd: 0, totalVnd: 349200 },
      refunds
    }
  };

  globalThis.fetch = jest.fn(async (path, request) => {
    if (path === '/api/v1/checkout/bookings/' + bookingId) {
      return jsonResponse(currentBooking);
    }
    if (path === '/api/v1/complaints/eligibility/bookings/' + bookingId) {
      return jsonResponse({ booking: { id: bookingId }, visits: [], wholeBooking: { eligible: false } });
    }
    if (path === '/api/v1/bookings/' + bookingId + '/change-options') {
      return jsonResponse({ bookingId, serverNow, canChangeBooking: false, slotNumbers: [], visits: [] });
    }
    if (path === '/api/v1/checkout/bookings/' + bookingId + '/cancellation-preview') {
      return previewHandler(JSON.parse(request.body));
    }
    if (path === '/api/v1/checkout/bookings/' + bookingId + '/cancellations') {
      const res = cancelHandler(JSON.parse(request.body), request);
      if (res.nextBooking) currentBooking = res.nextBooking;
      return res.response;
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  });

  const adapter = {
    resolve: async () => ({ status: 'authenticated', user: { id: 'cust-1', displayName: 'Khách hàng A', roles: ['CUSTOMER'] } }),
    getCsrfToken: () => 'synthetic-csrf'
  };

  return render(
    <MemoryRouter initialEntries={['/account/bookings/' + bookingId]}>
      <SessionProvider adapter={adapter}>
        <AppRoutes />
      </SessionProvider>
    </MemoryRouter>
  );
}

test('UC-39 hides cancel controls when all visits have already started', async () => {
  renderDetail({
    visits: [
      { id: visitStartedId, startAt: '2026-11-26T01:30:00.000Z', endAt: '2026-11-26T02:30:00.000Z', state: 'ASSIGNED', sitterName: 'Sitter Minh', evidence: [] }
    ]
  });

  expect(await screen.findByRole('heading', { name: 'Thông tin lịch đặt' })).toBeVisible();
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/bookings/' + bookingId + '/change-options', expect.anything()));
  expect(screen.queryByRole('button', { name: 'Huỷ lịch đặt' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Huỷ buổi' })).toBeNull();
});

test('ST-BKG-30 & ST-BKG-31 shows only unstarted visits in dialog, previews MSG27 with combo adjustment, cancels with MSG28 and displays recorded refund', async () => {
  const cancelCalls = [];
  const initialVisits = [
    { id: visitStartedId, startAt: '2026-11-26T01:00:00.000Z', endAt: '2026-11-26T02:00:00.000Z', state: 'ASSIGNED', sitterName: 'Sitter Cũ', evidence: [] },
    { id: visitUpcoming1Id, startAt: '2026-11-28T02:00:00.000Z', endAt: '2026-11-28T03:00:00.000Z', state: 'ASSIGNED', sitterName: 'Sitter Minh', evidence: [] },
    { id: visitUpcoming2Id, startAt: '2026-11-29T02:00:00.000Z', endAt: '2026-11-29T03:00:00.000Z', state: 'SCHEDULED', sitterName: null, evidence: [] }
  ];

  renderDetail({
    visits: initialVisits,
    previewHandler: body => {
      if (body.scope === 'VISIT') {
        return jsonResponse({
          scope: 'VISIT',
          visitId: body.visitId,
          isPaid: true,
          lateFeeTotalVnd: 0,
          comboDiscountAdjustmentVnd: 2400,
          refundTotalVnd: 114000,
          freeCancellation: true
        });
      }
      return jsonResponse({
        scope: 'BOOKING',
        isPaid: true,
        lateFeeTotalVnd: 36000,
        comboDiscountAdjustmentVnd: 0,
        refundTotalVnd: 199200,
        freeCancellation: false
      });
    },
    cancelHandler: (body, req) => {
      cancelCalls.push({ body, csrf: req.headers.get('X-CSRF-Token'), idem: req.headers.get('Idempotency-Key') });
      return {
        response: jsonResponse({
          bookingId,
          bookingState: 'DISPATCH_PENDING',
          scope: body.scope,
          cancelledVisitIds: [visitUpcoming1Id],
          lateFeeTotalVnd: 0,
          comboDiscountAdjustmentVnd: 2400,
          refundTotalVnd: 114000,
          messageCode: 'MSG28'
        }),
        nextBooking: {
          id: bookingId,
          state: 'DISPATCH_PENDING',
          paymentMode: 'PREPAY',
          paymentState: 'PAID',
          totalVnd: 349200,
          visits: [],
          careShifts: [],
          scheduleProposals: [],
          details: {
            terms: [{ serviceName: 'Chăm sóc tại gia', petNames: ['Bông'], careRequirements: [], startAt: initialVisits[0].startAt }],
            visits: [
              initialVisits[0],
              { ...initialVisits[1], state: 'CANCELLED' },
              initialVisits[2]
            ],
            price: { visitCount: 3, visitPricesVnd: [120000], discountVnd: 10800, orderFeeVnd: 0, totalVnd: 349200 },
            refunds: [{
              id: 'cancel:' + visitUpcoming1Id,
              visitId: visitUpcoming1Id,
              sourceType: 'BOOKING_CANCELLATION',
              state: 'RECORDED',
              amountVnd: 114000,
              lateFeeVnd: 0,
              comboDiscountAdjustmentVnd: 2400,
              reason: 'Thay đổi kế hoạch',
              recordedAt: '2026-11-26T02:05:00.000Z'
            }]
          }
        }
      };
    }
  });

  // Only 2 upcoming visits should have "Huỷ buổi" buttons (started visit excluded)
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Huỷ buổi' })).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Huỷ lịch đặt' }));

  const dialog = within(await screen.findByRole('dialog', { name: 'Xác nhận huỷ lịch đặt' }));
  // Default BOOKING preview shows late fee MSG27
  expect(await dialog.findByText(/Huỷ bây giờ sẽ giữ 36\.000.*30% giá buổi trước giảm giá.*199\.200.*sẽ được hoàn lại/)).toBeVisible();

  // Switch to single visit: started visit must NOT appear in the select options
  fireEvent.click(dialog.getByRole('button', { name: 'Một buổi' }));
  const visitSelect = dialog.getByLabelText('Chọn buổi cần huỷ');
  const optionValues = Array.from(visitSelect.options).map(opt => opt.value);
  expect(optionValues).toEqual([visitUpcoming1Id, visitUpcoming2Id]);
  expect(optionValues).not.toContain(visitStartedId);

  // Single visit preview shows free MSG27 + combo discount adjustment
  expect(await dialog.findByText(/Huỷ bây giờ được miễn phí: 114\.000.*sẽ được hoàn lại/)).toBeVisible();
  expect(dialog.getByText(/Điều chỉnh giảm giá nhiều buổi trên các buổi còn lại: − 2\.400/)).toBeVisible();

  // Optional reason selection & confirm
  fireEvent.change(dialog.getByLabelText('Lý do huỷ (không bắt buộc)'), { target: { value: 'Thay đổi kế hoạch' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Xác nhận huỷ' }));

  // MSG28 shown and recorded refund rendered on Booking Details
  expect(await screen.findByText('Đã huỷ. Người chăm sóc thú cưng của bạn đã được thông báo.')).toBeVisible();
  expect(await screen.findByText('Hoàn tiền đã ghi nhận')).toBeVisible();
  expect(screen.getByText(/114\.000/)).toBeVisible();
  expect(cancelCalls).toHaveLength(1);
  expect(cancelCalls[0].body).toEqual({ scope: 'VISIT', visitId: visitUpcoming1Id, reason: 'Thay đổi kế hoạch' });
  expect(cancelCalls[0].csrf).toBe('synthetic-csrf');
  expect(cancelCalls[0].idem).toBeTruthy();
});
