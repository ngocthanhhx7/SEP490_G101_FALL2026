import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SitterAssignmentsPage } from '../../src/pages/sitter/SitterAssignmentsPage.jsx';

const offer = { id: 'offer-1', visitId: 'visit-1', sitterId: 'sitter-1', state: 'PENDING', version: 1,
  offeredAt: '2026-10-14T23:00:00Z', deadline: '2026-10-15T01:00:00Z', startAt: '2026-10-16T02:00:00Z', endAt: '2026-10-16T03:00:00Z',
  serviceName: 'Chăm sóc chó', areaCode: 'Q1', pets: [{ id: 'pet-1', name: 'Milo', species: 'DOG' }], canRespond: true };
const assignment = { id: 'visit-2', visitId: 'visit-2', state: 'ASSIGNED', version: 1,
  startAt: '2026-10-17T02:00:00Z', endAt: '2026-10-17T03:00:00Z', serviceName: 'Chăm sóc mèo', areaCode: 'Q2', pets: [], handoverRequired: false, handoverAccepted: false };

function renderPage(api) { return render(<SitterAssignmentsPage api={api} createOperationKey={() => 'operation-123'} />); }

test('shows bounded offer detail, accepts once and refreshes assignments', async () => {
  const api = { listOffers: jest.fn(async () => ({ data: { items: [offer], nextCursor: null, limit: 20 } })),
    listAssignments: jest.fn(async () => ({ data: { items: [assignment], nextCursor: null, limit: 20 } })),
    acceptOffer: jest.fn(async () => ({ data: { offerId: 'offer-1', visitId: 'visit-1', state: 'ASSIGNED' } })), declineOffer: jest.fn() };
  renderPage(api);
  expect(await screen.findByText('Chăm sóc chó')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Chăm sóc chó/ }));
  expect(screen.getByText(/Địa chỉ và ghi chú riêng/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Nhận ca' }));
  expect(await screen.findByText('Máy chủ đã xác nhận nhận ca.')).toBeVisible();
  expect(api.acceptOffer).toHaveBeenCalledWith('offer-1', 1, 'operation-123');
  expect(api.listAssignments).toHaveBeenCalledTimes(2);
});

test('keeps ambiguous writes pending and prevents automatic resend', async () => {
  const api = { listOffers: jest.fn(async () => ({ data: { items: [offer], nextCursor: null, limit: 20 } })),
    listAssignments: jest.fn(async () => ({ data: { items: [], nextCursor: null, limit: 20 } })),
    acceptOffer: jest.fn(async () => { throw { code: 'TIMEOUT' }; }), declineOffer: jest.fn() };
  renderPage(api); await screen.findByText('Chăm sóc chó'); fireEvent.click(screen.getByRole('button', { name: /Chăm sóc chó/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Nhận ca' }));
  expect(await screen.findByText(/Chưa nhận được xác nhận/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeVisible();
  expect(api.acceptOffer).toHaveBeenCalledTimes(1);
});

test.each([
  ['forbidden', async () => { throw { status: 403 }; }, 'Không có quyền truy cập'],
  ['error', async () => { throw { status: 503 }; }, 'Không tải được offer'],
  ['pending', async () => ({ pending: true }), 'offer đang chờ tích hợp']
])('renders %s state', async (_name, load, text) => {
  const api = { listOffers: jest.fn(load), listAssignments: jest.fn(async () => ({ data: { items: [], nextCursor: null, limit: 20 } })) };
  renderPage(api); expect(await screen.findByText(text, { exact: false })).toBeVisible();
});

test('renders empty offer and schedule states', async () => {
  const api = { listOffers: jest.fn(async () => ({ data: { items: [], nextCursor: null, limit: 20 } })), listAssignments: jest.fn(async () => ({ data: { items: [], nextCursor: null, limit: 20 } })) };
  renderPage(api); await waitFor(() => expect(screen.getAllByText(/Chưa có/).length).toBeGreaterThanOrEqual(2));
});
