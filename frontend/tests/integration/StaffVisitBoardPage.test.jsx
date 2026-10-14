import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StaffVisitBoardPage } from '../../src/pages/admin/StaffVisitBoardPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const row = { id: 'visit-1', visitId: 'visit-1', kind: 'VISIT', state: 'SCHEDULED', version: 1,
  serviceName: 'Dắt chó', areaCode: 'Q1', petCount: 1, startAt: '2026-10-16T02:00:00Z', needsAction: true,
  remedyState: 'PENDING_CUSTOMER_CONFIRMATION' };
const detail = { ...row, endAt: '2026-10-16T03:00:00Z', noSitterReason: 'NO_ELIGIBLE_SITTER' };
const list = { data: { items: [row], nextCursor: null }, pending: false };
function renderPage(request, role = 'STAFF', status = 'authenticated') {
  const adapter = { resolve: async () => ({ status, user: { id: 'actor-1', roles: [role] } }), getCsrfToken: () => 'synthetic-csrf' };
  return render(<SessionProvider adapter={adapter}><StaffVisitBoardPage apiRequest={request} operationKey={() => 'synthetic-operation-123'} /></SessionProvider>);
}
function fixtureRequest(write = async () => ({ data: { visitId: row.id, state: 'PENDING_CUSTOMER_CONFIRMATION', visitResolved: false }, pending: false })) {
  return jest.fn(async (path, options = {}) => options.method === 'POST' ? write(path, options)
    : path.endsWith('/dispatch') ? { data: detail, pending: false } : list);
}
async function choose() { fireEvent.click(await screen.findByRole('button', { name: 'Xử lý visit-1' })); await screen.findByLabelText('Nội dung gửi Customer', { exact: false }); }
function fillProposal() {
  fireEvent.change(screen.getByLabelText('Nội dung gửi Customer', { exact: false }), { target: { value: 'Có thể chuyển sang lịch mới?' } });
  fireEvent.change(screen.getByLabelText('Bắt đầu mới (giờ Việt Nam)', { exact: false }), { target: { value: '2026-10-17T09:00' } });
  fireEvent.change(screen.getByLabelText('Kết thúc mới (giờ Việt Nam)', { exact: false }), { target: { value: '2026-10-17T10:00' } });
}
test.each(['CUSTOMER', 'PET_SITTER'])('role %s never calls board API', async role => {
  const request = jest.fn(); renderPage(request, role);
  expect(await screen.findByText('Không có quyền truy cập bảng điều phối')).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});
test.each(['STAFF', 'ADMIN'])('%s reads Vietnamese times and pending Customer choice', async role => {
  renderPage(fixtureRequest(), role);
  expect(await screen.findByText('Dắt chó')).toBeVisible();
  expect(screen.getByText('Chờ Customer xác nhận · Chưa giải quyết')).toBeVisible();
  expect(screen.getByText(/09:00/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Trang tiếp' })).toBeDisabled();
});
test.each([
  ['empty', async () => ({ data: { items: [], nextCursor: null } }), 'Không có công việc phù hợp'],
  ['forbidden', async () => { throw { status: 403 }; }, 'Không được phép xem khu vực'],
  ['error', async () => { throw { status: 503 }; }, 'Không tải được bảng điều phối'],
  ['pending', async () => ({ pending: true }), 'Bảng đang chờ']
])('shows %s state without rows/actions', async (_state, load, title) => {
  renderPage(jest.fn(load));
  expect(await screen.findByText(title)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Xử lý visit-1' })).not.toBeInTheDocument();
});
test('loading state remains visible while network unresolved', async () => {
  renderPage(jest.fn(() => new Promise(() => {})));
  expect(await screen.findByText('Đang tải bảng điều phối')).toBeVisible();
});
test('day/area/kind filters reset cursor and use Vietnam UTC interval', async () => {
  const request = fixtureRequest(); renderPage(request); await screen.findByText('Dắt chó');
  fireEvent.change(screen.getByLabelText('Ngày vận hành', { exact: false }), { target: { value: '2026-10-17' } });
  fireEvent.change(screen.getByLabelText('Mã khu vực', { exact: false }), { target: { value: 'Q1' } });
  fireEvent.change(screen.getByLabelText('Loại công việc', { exact: false }), { target: { value: 'OFFER' } });
  fireEvent.change(screen.getByLabelText('Trạng thái', { exact: false }), { target: { value: 'EXPIRED' } });
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('kind=OFFER'), expect.any(Object)));
  const path = request.mock.calls.at(-1)[0];
  expect(path).toContain('areaCode=Q1'); expect(path).toContain('state=EXPIRED');
  expect(decodeURIComponent(path)).toContain('fromAt=2026-10-16T17:00:00.000Z');
  expect(path).not.toContain('cursor=');
});
test('proposal uses UTC slot and server version/key; acknowledged proposal stays pending', async () => {
  const request = fixtureRequest(); renderPage(request); await choose(); fillProposal();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất · Chờ Customer' }));
  expect(await screen.findByText(/Đã ghi nhận đề xuất/)).toBeVisible();
  expect(request).toHaveBeenCalledWith('/visits/visit-1/remedies', expect.objectContaining({
    method: 'POST', idempotencyKey: 'synthetic-operation-123', body: { expectedVersion: 1,
      message: 'Có thể chuyển sang lịch mới?', alternatives: [{ startAt: '2026-10-17T02:00:00.000Z', endAt: '2026-10-17T03:00:00.000Z' }] }
  }));
  expect(screen.queryByText('Máy chủ đã xác nhận phân công.')).not.toBeInTheDocument();
});
test('network failure blocks automatic resend and leaves pending, no fake assignment', async () => {
  renderPage(fixtureRequest(async () => { throw { code: 'NETWORK_ERROR' }; })); await choose(); fillProposal();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất · Chờ Customer' }));
  expect(await screen.findByText(/Chưa nhận được xác nhận từ máy chủ/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Gửi đề xuất · Chờ Customer' })).toBeDisabled();
  expect(screen.queryByText('Máy chủ đã xác nhận phân công.')).not.toBeInTheDocument();
});
test('manual assignment stale/eligibility conflict keeps error and never claims success', async () => {
  renderPage(fixtureRequest(async () => { throw { status: 409, code: 'SITTER_NOT_ELIGIBLE' }; })); await choose();
  fireEvent.change(screen.getByLabelText('Mã Sitter', { exact: false }), { target: { value: 'sitter-1' } });
  fireEvent.change(screen.getByLabelText('Lý do phân công', { exact: false }), { target: { value: 'Điều phối' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và phân công' }));
  expect(await screen.findByText(/Lịch, điều kiện nhận ca hoặc phiên bản đã thay đổi/)).toBeVisible();
  expect(screen.queryByText('Máy chủ đã xác nhận phân công.')).not.toBeInTheDocument();
});
test.each(['INVALID_RESPONSE', 'TIMEOUT'])('ambiguous write error %s blocks resend', async code => {
  const request = fixtureRequest(async () => { throw { code }; });
  renderPage(request); await choose(); fillProposal();
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất · Chờ Customer' }));
  expect(await screen.findByText(/Chưa nhận được xác nhận từ máy chủ/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Gửi đề xuất · Chờ Customer' })).toBeDisabled();
  expect(request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});
test('acknowledgment for a different visit cannot confirm proposal success', async () => {
  renderPage(fixtureRequest(async () => ({ data: { visitId: 'other-visit', state: 'PENDING_CUSTOMER_CONFIRMATION', visitResolved: false } })));
  await choose(); fillProposal(); fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất · Chờ Customer' }));
  expect(await screen.findByText(/Chưa có xác nhận hợp lệ/)).toBeVisible();
  expect(screen.queryByText(/Đã ghi nhận đề xuất/)).not.toBeInTheDocument();
});
test('manual assignment success matches visit, sitter and incremented version', async () => {
  renderPage(fixtureRequest(async () => ({ data: { id: row.id, sitterId: 'sitter-1', state: 'ASSIGNED', version: 2 } })));
  await choose();
  fireEvent.change(screen.getByLabelText('Mã Sitter', { exact: false }), { target: { value: 'sitter-1' } });
  fireEvent.change(screen.getByLabelText('Lý do phân công', { exact: false }), { target: { value: 'Điều phối' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra và phân công' }));
  expect(await screen.findByText('Máy chủ đã xác nhận phân công.')).toBeVisible();
});
test('Customer response content and timestamp are visible in selected detail', async () => {
  const request = fixtureRequest(); request.mockImplementation(async path => path.endsWith('/dispatch') ? { data: { ...detail,
    remedy: { state: 'CUSTOMER_CONFIRMED', message: 'Đề xuất lịch mới', createdAt: '2026-10-15T02:00:00Z',
      alternatives: [{ id: '1', startAt: '2026-10-17T02:00:00Z', endAt: '2026-10-17T03:00:00Z' }],
      response: { message: 'Đồng ý phương án', respondedAt: '2026-10-15T03:00:00Z' } } } } : list);
  renderPage(request); await choose(); expect(screen.getByText(/Đồng ý phương án/)).toBeVisible();
});
