import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { VisitSchedulePage } from '../../src/pages/customer/visit-schedule/VisitSchedulePage.jsx';
import { ApiError } from '../../src/services/api-client.js';

const bookingId = '6b047c55e0b45d5aa4513c42';
// 2026-11-04 10:00 Vietnam time (UTC+7)
const fixedNow = Date.parse('2026-11-04T03:00:00.000Z');

function sampleBooking(overrides = {}) {
  return {
    id: bookingId,
    bookingCode: 'BK-0042',
    state: 'IN_PROGRESS',
    paymentMode: 'PREPAY',
    paymentState: 'PAID',
    details: {
      terms: [{ serviceName: 'Dắt chó đi dạo' }],
      visits: [
        {
          // 03/11 23:30 VN (16:30Z) - must stay on 03/11, NOT jump to 04/11!
          id: 'v-late-night',
          startAt: '2026-11-03T16:30:00.000Z',
          endAt: '2026-11-03T17:00:00.000Z',
          state: 'COMPLETED',
          sitterName: 'Lê Văn Minh'
        },
        {
          // 04/11 (today) 07:00 VN
          id: 'v-today-active',
          startAt: '2026-11-04T00:00:00.000Z',
          endAt: '2026-11-04T00:30:00.000Z',
          state: 'IN_PROGRESS',
          sitterName: 'Lê Văn Minh'
        },
        {
          // 05/11 07:00 VN - unassigned without offer -> "Chưa có người"
          id: 'v-unassigned',
          startAt: '2026-11-05T00:00:00.000Z',
          endAt: '2026-11-05T00:30:00.000Z',
          state: 'SCHEDULED',
          sitterName: null
        },
        {
          // 06/11 17:00 VN - cancelled -> non-clickable
          id: 'v-cancelled',
          startAt: '2026-11-06T10:00:00.000Z',
          endAt: '2026-11-06T10:30:00.000Z',
          state: 'CANCELLED',
          sitterName: null
        },
        {
          // 07/11 07:00 VN - pending offer -> "Đang chờ trả lời" + "Đang mời người"
          id: 'v-offering',
          startAt: '2026-11-07T00:00:00.000Z',
          endAt: '2026-11-07T00:30:00.000Z',
          state: 'SCHEDULED',
          sitterName: null,
          hasPendingOffer: true
        },
        {
          // 07/11 18:00 VN - moved same day from 17:00
          id: 'v-moved-same-day',
          startAt: '2026-11-07T11:00:00.000Z',
          endAt: '2026-11-07T11:30:00.000Z',
          previousStartAt: '2026-11-07T10:00:00.000Z',
          previousEndAt: '2026-11-07T10:30:00.000Z',
          state: 'ASSIGNED',
          sitterName: 'Phạm Thu Hà'
        },
        {
          // 08/11 09:00 VN - moved from another day (05/11 17:00)
          id: 'v-moved-other-day',
          startAt: '2026-11-08T02:00:00.000Z',
          endAt: '2026-11-08T02:30:00.000Z',
          previousStartAt: '2026-11-05T10:00:00.000Z',
          previousEndAt: '2026-11-05T10:30:00.000Z',
          state: 'ASSIGNED',
          sitterName: 'Lê Văn Minh'
        }
      ],
      price: { visitCount: 7, visitPricesVnd: [80000], discountVnd: 0, orderFeeVnd: 0, totalVnd: 560000 }
    },
    ...overrides
  };
}

function mountSchedule(api, { now = fixedNow } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/account/bookings/${bookingId}/visits`]}>
      <SessionProvider adapter={{
        getCsrfToken: () => 'csrf-token',
        resolve: async () => ({ status: 'authenticated', user: { id: 'cust-1', roles: ['CUSTOMER'] }, csrfToken: 'csrf-token' })
      }}>
        <Routes>
          <Route path="/account/bookings/:bookingId/visits" element={<VisitSchedulePage api={api} now={now} />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>
  );
}

describe('UC-28 Visit Schedule page', () => {
  test('groups visits by Vietnam day (including 23:30), highlights today, renders states/moved labels, and links active cards only', async () => {
    const api = { booking: jest.fn().mockResolvedValue(sampleBooking()) };
    mountSchedule(api);

    expect(await screen.findByRole('heading', { name: 'Lịch các buổi · BK-0042' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Quay lại Lịch đặt BK-0042' })).toHaveAttribute('href', `/account/bookings/${bookingId}`);
    expect(screen.getByText(/Dắt chó đi dạo · 03\/11 – 08\/11\/2026 · .* · 7 buổi/)).toBeVisible();
    expect(screen.getByText(/Mỗi buổi có khung giờ và trạng thái riêng/)).toBeVisible();

    const day03 = screen.getByRole('region', { name: 'Thứ Ba 03/11' });
    expect(within(day03).getByText('23:30 – 00:00')).toBeVisible();
    expect(within(day03).getByRole('link')).toHaveAttribute('href', `/account/bookings/${bookingId}/visits/v-late-night`);

    const day04 = screen.getByRole('region', { name: 'Thứ Tư · hôm nay 04/11' });
    expect(day04).toHaveClass('visit-schedule-day--today');
    expect(within(day04).getByText('Đang làm')).toBeVisible();
    expect(within(day04).getByRole('link')).toHaveAttribute('href', `/account/bookings/${bookingId}/visits/v-today-active`);

    const day05 = screen.getByRole('region', { name: 'Thứ Năm 05/11' });
    expect(within(day05).getByText('Chưa có người')).toBeVisible();
    expect(within(day05).getByText('Đang tìm người')).toBeVisible();

    const day06 = screen.getByRole('region', { name: 'Thứ Sáu 06/11' });
    expect(within(day06).getByText('17:00 – 17:30')).toBeVisible();
    expect(within(day06).queryByRole('link')).toBeNull();

    const day07 = screen.getByRole('region', { name: 'Thứ Bảy 07/11' });
    expect(within(day07).getByText('Đang chờ trả lời')).toBeVisible();
    expect(within(day07).getByText('Đang mời người')).toBeVisible();
    expect(within(day07).getByText('Đã đổi giờ từ 17:00')).toBeVisible();
    expect(within(day07).getAllByRole('link').map(el => el.getAttribute('href'))).toEqual([
      `/account/bookings/${bookingId}/visits/v-offering`,
      `/account/bookings/${bookingId}/visits/v-moved-same-day`
    ]);

    const day08 = screen.getByRole('region', { name: 'Chủ Nhật 08/11' });
    expect(within(day08).getByText('Đã đổi giờ từ 17:00 05/11')).toBeVisible();
  });

  test('renders consistent daily time pattern and disables all cards when the whole booking is cancelled', async () => {
    const api = {
      booking: jest.fn().mockResolvedValue(sampleBooking({
        bookingCode: null,
        state: 'CANCELLED',
        details: {
          terms: [{ serviceName: 'Dắt chó đi dạo' }],
          visits: [
            { id: 'v1', startAt: '2026-11-03T00:00:00.000Z', endAt: '2026-11-03T00:30:00.000Z', state: 'ASSIGNED', sitterName: 'Lê Văn Minh' },
            { id: 'v2', startAt: '2026-11-03T10:00:00.000Z', endAt: '2026-11-03T10:30:00.000Z', state: 'ASSIGNED', sitterName: 'Lê Văn Minh' },
            { id: 'v3', startAt: '2026-11-04T00:00:00.000Z', endAt: '2026-11-04T00:30:00.000Z', state: 'ASSIGNED', sitterName: 'Lê Văn Minh' },
            { id: 'v4', startAt: '2026-11-04T10:00:00.000Z', endAt: '2026-11-04T10:30:00.000Z', state: 'ASSIGNED', sitterName: 'Lê Văn Minh' }
          ],
          price: { visitCount: 4, visitPricesVnd: [80000], discountVnd: 0, orderFeeVnd: 0, totalVnd: 320000 }
        }
      }))
    };
    mountSchedule(api);

    expect(await screen.findByRole('heading', { name: 'Lịch các buổi · #A4513C42' })).toBeVisible();
    expect(screen.getByText('Dắt chó đi dạo · 03/11 – 04/11/2026 · 07:00 và 17:00 mỗi ngày · 4 buổi')).toBeVisible();
    const board = screen.getByRole('region', { name: 'Lịch các buổi theo ngày' });
    expect(within(board).queryByRole('link')).toBeNull();
  });

  test('shows error notice when another customer booking returns 404', async () => {
    const api = { booking: jest.fn().mockRejectedValue(new ApiError('RESOURCE_NOT_FOUND', 404)) };
    mountSchedule(api);

    expect(await screen.findByText('Không tìm thấy thông tin được yêu cầu.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});
