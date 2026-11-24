import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerDashboardPage } from '../../src/pages/customer/CustomerDashboardPage.jsx';
import { MobileCareHome } from '../../src/pages/customer/MobileCareHome.jsx';
import { useSession } from '../../src/contexts/SessionContext.jsx';
import { ApiError } from '../../src/services/api-client.js';

jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: jest.fn() }));

const SERVER_NOW = '2026-11-24T01:00:00.000Z'; // 08:00 +07:00
const HOTLINE = '024-7300-8899';

function makeAppointment({ id, code, startAt, localDate = '2026-11-24', startLocalTime, petName = 'Milo', serviceName = 'Tắm và vệ sinh thú cưng', hotline = HOTLINE }) {
  return {
    id,
    code,
    status: 'BOOKED',
    slot: { startAt, endAt: startAt, localDate, startLocalTime },
    pets: [{
      petId: `pet-${id}`,
      name: petName,
      status: 'BOOKED',
      durationMinutes: 60,
      finalPriceVnd: 110000,
      services: [{ serviceId: 'svc-1', name: serviceName, durationMinutes: 60, sizeLabel: 'chó 5–15 kg', priceVnd: 110000 }]
    }],
    pricing: { subtotalVnd: 110000, tierDiscountVnd: 0, totalVnd: 110000, currency: 'VND' },
    tier: { code: null, discountBps: 0, discountBlockedReason: null },
    shop: { address: '25 Láng Hạ', hotline },
    depositRequired: false,
    bookedAt: '2026-11-23T01:00:00.000Z'
  };
}

const threeHoursAway = makeAppointment({
  id: 'grm-3h',
  code: 'GR-0011',
  startAt: '2026-11-24T04:00:00.000Z', // 11:00 +07:00 (3h after 08:00)
  startLocalTime: '11:00',
  petName: 'Milo',
  serviceName: 'Tắm và vệ sinh thú cưng'
});

const oneHourAway = makeAppointment({
  id: 'grm-1h',
  code: 'GR-0012',
  startAt: '2026-11-24T02:00:00.000Z', // 09:00 +07:00 (1h after 08:00)
  startLocalTime: '09:00',
  petName: 'Mimi',
  serviceName: 'Cắt tỉa lông'
});

const emptyDashboardApi = () => ({ read: jest.fn(async () => ({ data: { metrics: [{ key: 'upcomingVisits', label: 'Buổi sắp tới', value: 0 }], items: [], nextCursor: null } })) });

beforeEach(() => {
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
      this.setAttribute('open', '');
    };
  }
  if (!window.HTMLDialogElement.prototype.close) {
    window.HTMLDialogElement.prototype.close = function close() {
      this.open = false;
      this.removeAttribute('open');
    };
  }
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  useSession.mockReturnValue({
    status: 'authenticated',
    user: { id: 'cust-1', displayName: 'Nguyễn An', roles: ['CUSTOMER'] },
    getCsrfToken: () => 'csrf-token'
  });
});

test('ST-GRM-07 (desktop): shows upcoming shop appointments in Sắp tới, cancels 3h away via MSG157 -> MSG158, blocks 1h away with MSG159 + hotline', async () => {
  const groomingApi = {
    listAppointments: jest.fn(async () => ({ items: [oneHourAway, threeHoursAway], total: 2, page: 1, limit: 20, serverNow: SERVER_NOW })),
    cancelAppointment: jest.fn(async () => ({ ...threeHoursAway, status: 'CANCELLED' }))
  };
  const dashboardApi = {
    read: jest.fn(async () => ({
      data: {
        metrics: [{ key: 'upcomingVisits', label: 'Buổi sắp tới', value: 1 }],
        items: [{ id: 'visit-1000', startsAt: '2026-11-24T03:00:00.000Z', state: 'ASSIGNED' }],
        nextCursor: null
      }
    }))
  };

  render(<MemoryRouter><CustomerDashboardPage api={dashboardApi} groomingApi={groomingApi} /></MemoryRouter>);

  expect(await screen.findByRole('heading', { name: 'Sắp tới' })).toBeVisible();
  expect(await screen.findByText('Tắm và vệ sinh thú cưng')).toBeVisible();
  expect(screen.getByText('Cắt tỉa lông')).toBeVisible();
  expect(screen.getByText(/Thú cưng: Milo/)).toBeVisible();
  expect(screen.getByText(/Thú cưng: Mimi/)).toBeVisible();
  expect(screen.getByText('Buổi chăm sóc #SIT-1000')).toBeVisible();

  // Step 2 (1 hour away): clicking Huỷ lịch immediately shows MSG159 in line with hotline, without opening MSG157 or calling API.
  const oneHourRow = screen.getByText('Cắt tỉa lông').closest('li');
  fireEvent.click(within(oneHourRow).getByRole('button', { name: 'Huỷ lịch' }));
  expect(within(oneHourRow).getByRole('alert')).toHaveTextContent(
    `Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng theo số ${HOTLINE}.`
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(groomingApi.cancelAppointment).not.toHaveBeenCalled();

  // Step 1 (3 hours away): clicking Huỷ lịch opens MSG157, confirming calls cancelAppointment, shows MSG158 and hides the row.
  const threeHourRow = screen.getByText('Tắm và vệ sinh thú cưng').closest('li');
  fireEvent.click(within(threeHourRow).getByRole('button', { name: 'Huỷ lịch' }));
  const dialog = screen.getByRole('alertdialog');
  expect(dialog).toHaveTextContent('Huỷ lịch hẹn lúc 11:00 ngày 24/11/2026? Không mất phí.');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Giữ lịch' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(groomingApi.cancelAppointment).not.toHaveBeenCalled();

  fireEvent.click(within(threeHourRow).getByRole('button', { name: 'Huỷ lịch' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xác nhận huỷ' }));

  await waitFor(() => expect(groomingApi.cancelAppointment).toHaveBeenCalledWith('grm-3h'));
  expect(await screen.findByRole('status')).toHaveTextContent('Lịch hẹn đã được huỷ.');
  expect(screen.queryByText('Tắm và vệ sinh thú cưng')).not.toBeInTheDocument();
});

test('ST-GRM-07 (desktop): closes MSG157 dialog and shows MSG159 in line when server rejects with GROOMING_CANCEL_TOO_LATE', async () => {
  const lateError = new ApiError('GROOMING_CANCEL_TOO_LATE', 409);
  lateError.details = { hotline: HOTLINE };
  const groomingApi = {
    listAppointments: jest.fn(async () => ({ items: [threeHoursAway], total: 1, page: 1, limit: 20, serverNow: SERVER_NOW })),
    cancelAppointment: jest.fn(async () => { throw lateError; })
  };

  render(<MemoryRouter><CustomerDashboardPage api={emptyDashboardApi()} groomingApi={groomingApi} /></MemoryRouter>);
  const row = (await screen.findByText('Tắm và vệ sinh thú cưng')).closest('li');
  fireEvent.click(within(row).getByRole('button', { name: 'Huỷ lịch' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xác nhận huỷ' }));

  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(within(row).getByRole('alert')).toHaveTextContent(
    `Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng theo số ${HOTLINE}.`
  );
  expect(screen.getByText('Tắm và vệ sinh thú cưng')).toBeVisible();
});

test('ST-GRM-07 (mobile): shows upcoming shop appointments in Sắp tới and supports MSG157 -> MSG158 and MSG159', async () => {
  const groomingApi = {
    listAppointments: jest.fn(async () => ({ items: [oneHourAway, threeHoursAway], total: 2, page: 1, limit: 20, serverNow: SERVER_NOW })),
    cancelAppointment: jest.fn(async () => ({ ...threeHoursAway, status: 'CANCELLED' }))
  };
  const catalog = { data: { available: true, services: [] } };

  render(<MemoryRouter><MobileCareHome api={emptyDashboardApi()} loadCatalog={async () => catalog} groomingApi={groomingApi} /></MemoryRouter>);

  expect(await screen.findByRole('heading', { name: 'Sắp tới' })).toBeVisible();
  expect(screen.queryByText('Chưa có lịch hẹn sắp tới')).not.toBeInTheDocument();

  const oneHourRow = (await screen.findByText(/Cắt tỉa lông/)).closest('li');
  fireEvent.click(within(oneHourRow).getByRole('button', { name: 'Huỷ lịch' }));
  expect(within(oneHourRow).getByRole('alert')).toHaveTextContent(
    `Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng theo số ${HOTLINE}.`
  );

  const threeHourRow = screen.getByText(/Tắm và vệ sinh thú cưng/).closest('li');
  fireEvent.click(within(threeHourRow).getByRole('button', { name: 'Huỷ lịch' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Huỷ lịch hẹn lúc 11:00 ngày 24/11/2026? Không mất phí.');
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xác nhận huỷ' }));

  await waitFor(() => expect(groomingApi.cancelAppointment).toHaveBeenCalledWith('grm-3h'));
  expect(await screen.findByText('Lịch hẹn đã được huỷ.')).toHaveAttribute('role', 'status');
  expect(screen.queryByText(/Tắm và vệ sinh thú cưng/)).not.toBeInTheDocument();
});
