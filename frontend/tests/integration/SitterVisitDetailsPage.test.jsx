import { fireEvent, render, screen } from '@testing-library/react';
import { SitterVisitDetailsPage } from '../../src/pages/sitter/SitterVisitDetailsPage.jsx';

const visit = { visitId: 'visit-1', version: 2, state: 'ASSIGNED', startAt: '2026-10-16T02:00:00Z', endAt: '2026-10-16T03:00:00Z',
  serviceName: 'Chăm sóc chó', areaCode: 'Q1', pets: [{ id: 'pet-1', name: 'Milo', species: 'DOG' }] };

function renderPage(api) { return render(<SitterVisitDetailsPage visitId="visit-1" api={api} createOperationKey={() => 'withdraw-key-1'} />); }

test('keeps access notes behind an explicit window-authorized request', async () => {
  const api = { getVisit: jest.fn(async () => ({ data: visit })), getAccessNotes: jest.fn(async () => ({ data: { visitId: 'visit-1', privateAccessNotes: 'Ring bell' } })) };
  renderPage(api); expect(await screen.findByText('Chăm sóc chó')).toBeVisible();
  expect(screen.queryByText('Ring bell')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và xem ghi chú' }));
  expect(await screen.findByText('Ring bell')).toBeVisible();
  expect(api.getAccessNotes).toHaveBeenCalledWith('visit-1');
});

test.each([
  ['closed window', { code: 'ACCESS_WINDOW_CLOSED' }, 'Ghi chú ra vào chỉ mở'],
  ['handover', { code: 'HANDOVER_REQUIRED' }, 'Bàn giao chưa được xác nhận']
])('shows private-note %s without leaking content', async (_name, error, message) => {
  const api = { getVisit: jest.fn(async () => ({ data: visit })), getAccessNotes: jest.fn(async () => { throw error; }) };
  renderPage(api); await screen.findByText('Chăm sóc chó'); fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và xem ghi chú' }));
  expect(await screen.findByText(new RegExp(message))).toBeVisible(); expect(screen.queryByText('Ring bell')).not.toBeInTheDocument();
});

test('withdrawal sends version and idempotency key and never claims payout', async () => {
  const api = { getVisit: jest.fn(async () => ({ data: visit })), getAccessNotes: jest.fn(), withdrawVisit: jest.fn(async () => ({ data: { visitId: 'visit-1', state: 'WITHDRAWN', scheduleChanged: false, payoutRequested: false } })) };
  renderPage(api); await screen.findByText('Chăm sóc chó'); fireEvent.change(screen.getByLabelText('Lý do', { exact: false }), { target: { value: 'Unexpected conflict' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu rút' }));
  expect(await screen.findByText(/Đã rút khỏi visit/)).toBeVisible();
  expect(api.withdrawVisit).toHaveBeenCalledWith('visit-1', { expectedVersion: 2, reason: 'Unexpected conflict' }, 'withdraw-key-1');
});

test('loading, pending and forbidden states do not render visit data', async () => {
  const api = { getVisit: jest.fn(() => new Promise(() => {})) };
  renderPage(api); expect(await screen.findByText('Đang tải chi tiết visit')).toBeVisible();
});
