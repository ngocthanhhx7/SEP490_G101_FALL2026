import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VisitClosurePanel } from '../../src/pages/staff/VisitClosurePanel.jsx';
import { formatBookingRef, formatOverdue } from '../../src/utils/visit-closure-format.js';
import { ApiError } from '../../src/services/api-client.js';

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

// 06:00 – 06:30 on 04/11/2026 in Vietnam time.
const row = { id: 'visit-1', bookingId: '6720a1b2c3d4e5f6a7b8c9d0', bookingCode: 'BK-0033', startAt: '2026-11-03T23:00:00Z', endAt: '2026-11-03T23:30:00Z',
  customerName: 'Bùi Thanh Tâm', sitterName: 'Lê Văn Minh', overdueMs: (2 * 60 + 10) * 60000, version: 4, hasCheckInPhoto: true };
const details = (extra = {}) => ({ data: { ...row, checkInAt: '2026-11-03T23:02:00Z', ...extra } });
function fixture({ items = [row], photo = true } = {}) {
  return {
    closableVisits: jest.fn().mockResolvedValue({ data: { items, hasMore: false } }),
    closureDetails: jest.fn().mockResolvedValue(details({ hasCheckInPhoto: photo })),
    closeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'visit-1', state: 'STAFF_CLOSED', version: 5 } })
  };
}
async function openDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Đóng buổi' }));
  return within(await screen.findByRole('dialog'));
}

test('lists a visit not checked out with its reason, time late and the close action', async () => {
  render(<VisitClosurePanel api={fixture()} />);
  const table = await screen.findByRole('region', { name: 'Buổi chưa check-out' });
  expect(within(table).getByText('BK-0033')).toBeInTheDocument();
  expect(within(table).getByText('Chưa check-out sau 2 giờ')).toBeInTheDocument();
  expect(within(table).getByText('Trễ 2 giờ 10 phút')).toBeInTheDocument();
  expect(within(table).getByText('Lê Văn Minh')).toBeInTheDocument();
  expect(within(table).getByText('04/11 · 06:00 – 06:30')).toBeInTheDocument();
});

test('a booking without a code shows the end of its id in the table and in the dialog', async () => {
  const noCode = { ...row, bookingCode: null };
  const api = fixture({ items: [noCode] });
  api.closureDetails.mockResolvedValue(details({ bookingCode: null }));
  render(<VisitClosurePanel api={api} />);
  const table = await screen.findByRole('region', { name: 'Buổi chưa check-out' });
  expect(within(table).getByText('…b8c9d0')).toBeInTheDocument();
  expect(within(table).queryByText('Lịch đặt')).not.toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button', { name: 'Đóng buổi' }));
  const modal = within(await screen.findByRole('dialog'));
  expect(await modal.findByText('…b8c9d0 · 04/11 · 06:00 – 06:30')).toBeInTheDocument();
});

test.each([
  [{ bookingCode: 'BK-0033', bookingId: '6720a1b2c3d4e5f6a7b8c9d0' }, 'BK-0033'],
  [{ bookingCode: null, bookingId: '6720a1b2c3d4e5f6a7b8c9d0' }, '…b8c9d0'],
  [{ bookingId: '6720a1b2c3d4e5f6a7b8c9d0' }, '…b8c9d0'],
  [{ bookingCode: null }, 'Lịch đặt']
])('formatBookingRef(%j) = %s', (input, expected) => expect(formatBookingRef(input)).toBe(expected));

test('renders nothing without rows or without the closure API', async () => {
  const empty = fixture({ items: [] });
  const { container, rerender } = render(<VisitClosurePanel api={empty} />);
  await waitFor(() => expect(empty.closableVisits).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
  rerender(<VisitClosurePanel api={{}} />);
  expect(container).toBeEmptyDOMElement();
});

test.each([[true, '06:02, có ảnh check-in'], [false, '06:02, không có ảnh check-in']])('dialog shows the visit, sitter and check-in (photo: %s)', async (photo, text) => {
  render(<VisitClosurePanel api={fixture({ photo })} />);
  const modal = await openDialog();
  expect(await modal.findByText('BK-0033 · 04/11 · 06:00 – 06:30')).toBeInTheDocument();
  expect(modal.getByText('Lê Văn Minh')).toBeInTheDocument();
  expect(modal.getByText(text)).toBeInTheDocument();
  expect(modal.getByText(/Buổi có ảnh check-in được tính là đã làm/)).toBeInTheDocument();
});

test('a visit without a check-in photo can be closed: MSG71 shown and the list reloaded', async () => {
  const api = fixture({ photo: false });
  api.closeVisit.mockResolvedValueOnce({ data: { visitId: 'visit-1', state: 'CANCELLED', version: 5, chargeAmount: 0 } });
  render(<VisitClosurePanel api={api} />);
  const modal = await openDialog();
  expect(await modal.findByLabelText(/Lý do/)).toBeEnabled();
  expect(modal.getByRole('button', { name: 'Đóng buổi' })).toBeEnabled();
  fireEvent.change(modal.getByLabelText(/Lý do/), { target: { value: 'Không có ảnh, đã gọi người chăm sóc.' } });
  fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
  expect(await screen.findByText('Đã đóng buổi.')).toBeInTheDocument();
  expect(api.closeVisit).toHaveBeenCalledWith('visit-1', { expectedVersion: 4, reason: 'Không có ảnh, đã gọi người chăm sóc.' }, expect.stringMatching(/^closure:/));
  await waitFor(() => expect(api.closableVisits).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a missing reason blocks the close and writes nothing; Quay lại closes without a change', async () => {
  const api = fixture();
  render(<VisitClosurePanel api={api} />);
  const modal = await openDialog();
  await modal.findByLabelText(/Lý do/);
  fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
  expect(await modal.findByText('Nhập lý do đóng buổi.')).toBeInTheDocument();
  fireEvent.change(modal.getByLabelText(/Lý do/), { target: { value: '   ' } });
  fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
  expect(api.closeVisit).not.toHaveBeenCalled();
  fireEvent.click(modal.getByRole('button', { name: 'Quay lại' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.closeVisit).not.toHaveBeenCalled();
});

test('MSG71: closes once with the trimmed reason and the server version, then reloads the list', async () => {
  const api = fixture();
  render(<VisitClosurePanel api={api} onChanged={jest.fn()} />);
  const modal = await openDialog();
  fireEvent.change(await modal.findByLabelText(/Lý do/), { target: { value: '  Đã gọi xác nhận lúc 08:40.  ' } });
  const submit = modal.getByRole('button', { name: 'Đóng buổi' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(await screen.findByText('Đã đóng buổi.')).toBeInTheDocument();
  expect(api.closeVisit).toHaveBeenCalledTimes(1);
  expect(api.closeVisit).toHaveBeenCalledWith('visit-1', { expectedVersion: 4, reason: 'Đã gọi xác nhận lúc 08:40.' }, expect.stringMatching(/^closure:/));
  await waitFor(() => expect(api.closableVisits).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each([
  ['VERSION_CONFLICT', 'Buổi vừa được cập nhật. Tải lại rồi kiểm tra trước khi đóng.'],
  ['INVALID_STATE', 'Buổi không còn ở trạng thái chưa check-out. Tải lại danh sách.']
])('409 %s keeps the dialog open with the message', async (code, message) => {
  const api = fixture();
  api.closeVisit.mockRejectedValueOnce(new ApiError(code, 409));
  render(<VisitClosurePanel api={api} />);
  const modal = await openDialog();
  fireEvent.change(await modal.findByLabelText(/Lý do/), { target: { value: 'Lý do thử' } });
  fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.queryByText('Đã đóng buổi.')).not.toBeInTheDocument();
});

test('after a lost response the retry reuses the same Idempotency-Key', async () => {
  const api = fixture();
  api.closeVisit.mockRejectedValueOnce(new ApiError('NETWORK_ERROR'));
  render(<VisitClosurePanel api={api} />);
  const modal = await openDialog();
  fireEvent.change(await modal.findByLabelText(/Lý do/), { target: { value: 'Mất kết nối' } });
  fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
  expect(await screen.findByText('Chưa nhận được xác nhận. Gửi lại cùng yêu cầu để kiểm tra.')).toBeInTheDocument();
  fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
  expect(await screen.findByText('Đã đóng buổi.')).toBeInTheDocument();
  const keys = api.closeVisit.mock.calls.map(call => call[2]);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test('formatOverdue reads hours and minutes since the visit ended', () => {
  expect(formatOverdue(130 * 60000)).toBe('Trễ 2 giờ 10 phút');
  expect(formatOverdue(120 * 60000)).toBe('Trễ 2 giờ');
  expect(formatOverdue(35 * 60000)).toBe('Trễ 35 phút');
});
