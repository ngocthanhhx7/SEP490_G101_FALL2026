import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { safeComplaint } from '../../../backend/src/services/complaints/complaint-projection.js';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { ComplaintManagementPage } from '../../src/pages/staff/ComplaintManagementPage.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const bookingId = 'b'.repeat(24);
const item = { id: 'case-1', code: 'KN-123456789ABC', kind: 'COMPLAINT', state: 'OPEN', scope: 'VISIT',
  version: 2, bookingId, description: 'Bơ về nhà bị dính bùn.', evidenceRefs: [],
  customer: { displayName: 'Trần Thị Lan' }, booking: { code: 'BK-0042', serviceName: 'Dắt chó đi dạo' },
  visit: { startAt: '2026-11-11T09:08:00Z', endAt: '2026-11-11T09:38:00Z', sitterName: 'Lê Văn Minh' },
  createdAt: '2026-11-12T02:05:00Z', openDays: 4, billState: 'ON_HOLD',
  billing: { status: 'UNAVAILABLE', code: 'BILLING_SOURCE_UNAVAILABLE' } };
const list = (items = [item]) => ({ data: { items, counts: { OPEN: items.length, ESCALATED: 1, RESOLVED: 0 } } });
const session = role => ({ getCsrfToken: () => 'synthetic-csrf',
  resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: [role] } }) });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function fixture(detail = item) {
  return { list: jest.fn(async () => list()), get: jest.fn(async () => ({ data: detail })),
    resolve: jest.fn(async () => ({ data: { messageCode: 'MSG131', state: 'RESOLVED' } })),
    decide: jest.fn(async () => ({ data: { state: 'RESOLVED' } })) };
}

function show(api, { role = 'STAFF', path = '/staff/complaints', imageApi } = {}) {
  return render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={session(role)}>
    <ComplaintManagementPage api={api} imageApi={imageApi} />
  </SessionProvider></MemoryRouter>);
}

async function enterRequired() {
  fireEvent.change(await screen.findByLabelText(/Ghi chú xử lý/), { target: { value: 'Đã gọi khách.' } });
  fireEvent.change(screen.getByLabelText(/Kết quả gửi khách/), { target: { value: 'Đã xác minh.' } });
}

test('UC-53 reads counts, searches, sorts, and shows the old open case warning', async () => {
  const api = fixture();
  api.list.mockImplementation(async ({ q }) => list(q ? [] : [item]));
  show(api);
  expect(await screen.findByRole('tab', { name: 'Đang mở (1)' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Chuyển quản trị (1)' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Đã giải quyết (0)' })).toBeVisible();
  expect(screen.getAllByText('Mở 4 ngày')[0]).toBeVisible();
  fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'oldest' } });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'BK-9999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  expect(await screen.findByText('Không tìm thấy khiếu nại.')).toBeVisible();
  expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'OPEN', sort: 'oldest', q: 'BK-9999' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Chuyển quản trị (1)' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'ESCALATED' })));
});

test('UC-53 shows Mở 3 ngày only after the open complaint exceeds 72 hours', async () => {
  const asOf = new Date('2026-11-15T02:05:00Z');
  const staff = { roles: ['STAFF'] };
  const atThreshold = safeComplaint(item, staff, asOf);
  const pastThreshold = safeComplaint({
    ...item, id: 'case-2', code: 'KN-123456789ABD', createdAt: '2026-11-12T02:04:00Z'
  }, staff, asOf);
  const api = fixture(atThreshold);
  api.list.mockResolvedValue(list([atThreshold, pastThreshold]));
  show(api);

  const exactRow = within(await screen.findByRole('button', { name: /KN-123456789ABC/ }));
  expect(exactRow.getByText('Đang mở')).toBeVisible();
  expect(exactRow.queryByText(/^Mở \d+ ngày$/)).not.toBeInTheDocument();
  const olderRow = within(screen.getByRole('button', { name: /KN-123456789ABD/ }));
  expect(olderRow.getByText('Mở 3 ngày')).toBeVisible();
});

test('UC-53 retries a failed list request and displays the recovered list', async () => {
  const api = fixture();
  api.list.mockRejectedValueOnce(Object.assign(new Error('List unavailable'), { status: 503 }));
  show(api);

  const error = await screen.findByRole('alert', { name: 'Chưa tải được danh sách khiếu nại' });
  expect(error).toBeVisible();
  expect(api.list).toHaveBeenCalledTimes(1);
  fireEvent.click(within(error).getByRole('button', { name: 'Thử lại' }));

  expect(await screen.findByRole('button', { name: /KN-123456789ABC/ })).toBeVisible();
  expect(api.list).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert', { name: 'Chưa tải được danh sách khiếu nại' })).not.toBeInTheDocument();
});

test('UC-53 validates required fields and resolves without money when billing is unavailable', async () => {
  const api = fixture();
  show(api);
  expect(await screen.findByRole('heading', { name: item.code })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem lịch đặt' })).toHaveAttribute('href', '/staff/bookings/' + bookingId);
  expect(screen.queryByRole('link', { name: 'Xem báo cáo chăm sóc' })).toBeNull();
  expect(screen.getByLabelText('Số tiền đề xuất hoàn')).toBeDisabled();
  expect(screen.getByText(/Chưa có nguồn hóa đơn/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Giải quyết' }));
  expect(screen.getAllByText('Trường này là bắt buộc.')).toHaveLength(2);
  expect(api.resolve).not.toHaveBeenCalled();
  await enterRequired();
  fireEvent.click(screen.getByRole('button', { name: 'Giải quyết' }));
  expect(await screen.findByText('Đã gửi kết quả cho khách hàng.')).toBeVisible();
  expect(api.resolve).toHaveBeenCalledWith(expect.objectContaining({ complaintId: item.id,
    expectedVersion: 2, handlingNotes: 'Đã gọi khách.', customerResult: 'Đã xác minh.' }));
  expect(api.resolve.mock.calls[0][0]).not.toHaveProperty('proposal');
});

test('UC-53 checks the fixture cap, requires evidence, and sends MSG147 without a final result', async () => {
  const api = fixture({ ...item, billing: { status: 'AVAILABLE', basis: 'EXPECTED', basisAmountVnd: 769500, remainingVnd: 45000 } });
  api.resolve.mockResolvedValue({ data: { state: 'OPEN', messageCode: 'MSG147' } });
  const imageApi = { upload: jest.fn(async () => ({ id: 'b'.repeat(64) })) };
  show(api, { imageApi });
  await enterRequired();
  const amount = screen.getByLabelText('Số tiền đề xuất hoàn');
  fireEvent.change(amount, { target: { value: '45001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Giải quyết' }));
  expect(screen.getByText(/không được vượt quá 45.000/)).toBeVisible();
  expect(api.resolve).not.toHaveBeenCalled();
  fireEvent.change(amount, { target: { value: '45000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Giải quyết' }));
  expect(screen.getAllByText('Trường này là bắt buộc.')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Lý do và bằng chứng'), { target: { value: 'Có ảnh minh chứng.' } });
  const pdf = new globalThis.File(['document'], 'evidence.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Thêm tệp'), { target: { files: [pdf] } });
  expect(screen.getByText('Chọn ảnh PNG hoặc JPEG không quá 5 MB.')).toBeVisible();
  expect(imageApi.upload).not.toHaveBeenCalled();
  const file = new globalThis.File(['image'], 'evidence.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Thêm tệp'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Giải quyết' }));
  expect(await screen.findByText(/Đã gửi khoản đề xuất cho quản trị viên/)).toBeVisible();
  expect(imageApi.upload).toHaveBeenCalledWith(file, expect.objectContaining({ idempotencyKey: expect.any(String) }));
  expect(api.resolve).toHaveBeenCalledWith(expect.objectContaining({
    proposal: { amountVnd: 45000, reason: 'Có ảnh minh chứng.', evidenceRefs: ['b'.repeat(64)] }
  }));
});

test.each(['STAFF', 'ADMIN'])('UC-53 deep link opens the escalated complaint for %s', async role => {
  const detail = { ...item, id: 'case-outside-page', state: 'ESCALATED', objectionReason: 'Khách muốn xem lại.' };
  const api = fixture(detail);
  show(api, { role, path: '/' + role.toLowerCase() + '/complaints?complaint=' + detail.id });
  expect(await screen.findByText('Khách muốn xem lại.')).toBeVisible();
  expect(api.get).toHaveBeenCalledWith(expect.objectContaining({ complaintId: detail.id }));
  if (role === 'STAFF') {
    expect(screen.queryByRole('button', { name: 'Ghi kết quả cuối' })).toBeNull();
  } else {
    fireEvent.change(screen.getByLabelText(/Kết quả cuối gửi khách/), { target: { value: 'Kết quả cuối cùng.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả cuối' }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith(expect.objectContaining({
      complaintId: detail.id, expectedVersion: 2, customerResult: 'Kết quả cuối cùng.'
    })));
    expect(api.decide.mock.calls[0][0]).not.toHaveProperty('amountVnd');
  }
});

test.each(['/staff/complaints', '/admin/complaints'])('UC-53 blocks Sale Staff on %s', async path => {
  globalThis.fetch = jest.fn();
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={session('SALE_STAFF')}>
    <AppRoutes />
  </SessionProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
