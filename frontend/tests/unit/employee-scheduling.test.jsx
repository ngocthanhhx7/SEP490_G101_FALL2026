import { beforeAll } from '@jest/globals';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EmployeeInvitationsPage } from '../../src/pages/sitter/EmployeeInvitationsPage.jsx';
import { EmployeeDispatchPage } from '../../src/pages/staff/EmployeeDispatchPage.jsx';
import { createEmployeeSchedulingApi } from '../../src/services/employee-scheduling-api.js';
import { MemoryRouter } from 'react-router-dom';
import { DirectedBookingProposalPage } from '../../src/pages/customer/DirectedBookingProposalPage.jsx';
import { StaffTravelMonitor } from '../../src/pages/staff/StaffTravelMonitor.jsx';

afterEach(cleanup);
// The dispatch page also asks for the Staff visit board; answer it here so these tests keep checking the travel requests only.
const withoutClosures = request => (path, ...rest) => (/\/(closable-visits|visit-board)(\?|$)/.test(path) ? Promise.resolve({ data: { items: [], counts: { needsAction: 0 } } }) : request(path, ...rest));
test.each([false, undefined])('dispatch omits travel requests when travel capability is %s', async visitTravelEnabled => {
  const request = jest.fn().mockResolvedValue({ data: { items: [], visitTravelEnabled } });
  render(<EmployeeDispatchPage api={createEmployeeSchedulingApi(withoutClosures(request))} />);
  await waitFor(() => expect(screen.queryByText('Đang tải ca…')).not.toBeInTheDocument());

  expect(screen.getByRole('heading', { name: 'Hàng đợi tìm người của hệ thống' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Ca đang đến điểm chăm sóc' })).not.toBeInTheDocument();
  expect(screen.queryByText('Chưa tải được các ca di chuyển.')).not.toBeInTheDocument();
  expect(request.mock.calls.map(([path]) => path)).toEqual(['/employee-scheduling/dispatch']);
});

test('dispatch loads travel rows when travel capability is enabled', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ data: { items: [], visitTravelEnabled: true } })
    .mockResolvedValueOnce({ data: { items: [{ id: 'visit', serviceName: 'Synthetic travel row',
      startAt: '2026-11-03T02:00:00Z', endAt: '2026-11-03T03:00:00Z' }] } })
    .mockResolvedValue({ data: { items: [], visitTravelEnabled: true } });
  render(<EmployeeDispatchPage api={createEmployeeSchedulingApi(withoutClosures(request))} />);

  expect(await screen.findByText('Synthetic travel row')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Ca đang đến điểm chăm sóc' })).toBeVisible();
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/employee-scheduling/dispatch', '/employee-scheduling/travel-visits'
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Tải lại lịch điều phối' }));
  await waitFor(() => expect(screen.queryByText('Đang tải ca…')).not.toBeInTheDocument());
  expect(screen.getByText('Synthetic travel row')).toBeVisible();
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    '/employee-scheduling/dispatch', '/employee-scheduling/travel-visits', '/employee-scheduling/dispatch'
  ]);
});

test.each([['HTTP 500', { status: 500 }], ['network', new Error('Offline')]])(
  'dispatch shows the travel error for an enabled feature with a %s failure', async (_label, error) => {
    const request = jest.fn()
      .mockResolvedValueOnce({ data: { items: [], visitTravelEnabled: true } })
      .mockRejectedValueOnce(error);
    render(<EmployeeDispatchPage api={createEmployeeSchedulingApi(withoutClosures(request))} />);

    expect(await screen.findByText('Chưa tải được các ca di chuyển.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Hàng đợi tìm người của hệ thống' })).toBeVisible();
  }
);

test('Staff travel monitor pages assigned visits without exposing employee mutation controls', async () => {
  const api = { travelVisits: jest.fn().mockResolvedValueOnce({ data: { items: [{ id: 'visit', sitterId: 'employee',
    serviceName: 'Synthetic live care', areaCode: 'HANOI', startAt: new Date(Date.now() + 60000).toISOString(), endAt: new Date(Date.now() + 3600000).toISOString() }], nextCursor: 'next' } })
    .mockResolvedValue({ data: { items: [] } }) };
  render(<StaffTravelMonitor api={api} />);
  expect(await screen.findByText('Synthetic live care')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Chia sẻ vị trí' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trang ca di chuyển sau' }));
  await waitFor(() => expect(api.travelVisits).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next' })));
});
const fixture = () => ({
  offers: jest.fn().mockResolvedValue({ data: { items: [{ id: 'offer', version: 2, canRespond: true, serviceName: 'Chăm sóc tại gia',
    startAt: '2026-11-03T02:00:00Z', endAt: '2026-11-03T03:00:00Z', deadline: '2026-11-01T02:15:00Z', areaCode: 'CITY_HANOI', state: 'PENDING', pets: [{ name: 'Milo' }] }] } }),
  assignments: jest.fn().mockResolvedValue({ data: { items: [] } }), respond: jest.fn().mockResolvedValue({ data: { state: 'ASSIGNED' } }),
  queue: jest.fn().mockResolvedValue({ data: { items: [] } }), plans: jest.fn().mockResolvedValue({ data: { items: [{ id: 'booking', version: 3, customerVisitCount: 1, paymentState: 'PAID' }] } }),
  preview: jest.fn().mockResolvedValue({ data: { bookingId: 'booking', version: 3, shifts: [{ sequence: 0, serviceName: 'Lưu trú', startAt: '2026-11-03T01:00:00Z', endAt: '2026-11-03T09:00:00Z' }] } }),
  finalize: jest.fn().mockResolvedValue({ data: { state: 'SCHEDULED' } }), invite: jest.fn().mockResolvedValue({ data: { state: 'PENDING' } })
});

test('employee sees scoped invitations and explicitly accepts their version', async () => {
  const api = fixture(); render(<EmployeeInvitationsPage api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nhận việc' }));
  await waitFor(() => expect(api.respond).toHaveBeenCalledWith('offer', 'acceptances', 2, expect.stringMatching(/^schedule:/)));
  await waitFor(() => expect(api.offers.mock.calls.length).toBeGreaterThan(1));
});

test('employee can page through invitation history and return without changing assignment pagination', async () => {
  const api = fixture();
  api.offers.mockResolvedValueOnce({ data: { items: [], nextCursor: 'next-offer' } }).mockResolvedValue({ data: { items: [], nextCursor: null } });
  render(<EmployeeInvitationsPage api={api} />);
  const next = await screen.findByRole('button', { name: 'Trang lời mời sau' });
  await waitFor(() => expect(next).toBeEnabled()); fireEvent.click(next);
  await waitFor(() => expect(api.offers).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next-offer' })));
  fireEvent.click(screen.getByRole('button', { name: 'Trang lời mời trước' }));
  await waitFor(() => expect(api.offers).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined })));
  expect(api.assignments).toHaveBeenCalledTimes(1);
});

test('uncertain invitation response freezes other commands and repeats exactly the same operation', async () => {
  const api = fixture(); api.respond.mockRejectedValueOnce({ code: 'TIMEOUT' }); render(<EmployeeInvitationsPage api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nhận việc' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu' }));
  await waitFor(() => expect(api.respond).toHaveBeenCalledTimes(2));
  expect(api.respond.mock.calls[0]).toEqual(api.respond.mock.calls[1]);
});

test('Staff sees automatic search and only intervenes on a dispatch escalation', async () => {
  const api = fixture(); api.queue.mockResolvedValue({ data: { items: [
    { id: 'searching', serviceName: 'Ca hệ thống', dispatchState: 'SYSTEM_SEARCHING', startAt: '2026-11-03T01:00:00Z', endAt: '2026-11-03T02:00:00Z' },
    { id: 'review', serviceName: 'Ca cần xử lý', version: 3, dispatchState: 'NEEDS_STAFF', reviewCode: 'STAFF_REVIEW_REQUIRED', startAt: '2026-11-03T03:00:00Z', endAt: '2026-11-03T04:00:00Z' }
  ] } });
  render(<EmployeeDispatchPage api={api} />);
  expect(await screen.findByText('Hệ thống đang tìm người')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Xác nhận kế hoạch' })).not.toBeInTheDocument();
  expect(api.plans).not.toHaveBeenCalled(); expect(api.finalize).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'Xem / xử lý'}));
  fireEvent.click(screen.getByRole('button', { name: 'Thử tìm lại' }));
  await waitFor(() => expect(api.invite).toHaveBeenCalledWith('review', 3, expect.any(String), undefined));
});

test('two registration adapters use separate endpoints, cookie transport, shared expected versions and stable keys', async () => {
  const request = jest.fn().mockResolvedValue({ data: {} }), api = createEmployeeSchedulingApi(request);
  await api.saveAvailability({ expectedVersion: 7, zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-11-03', workingWindows: [], idempotencyKey: 'time-key-001' });
  await api.save({ expectedVersion: 8, areas: ['CITY_HANOI'], idempotencyKey: 'area-key-001' });
  expect(request.mock.calls[0]).toEqual(['/employee-scheduling/availability', { method: 'PUT', body: { expectedVersion: 7,
    zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-11-03', workingWindows: [] }, idempotencyKey: 'time-key-001', signal: undefined }]);
  expect(request.mock.calls[1][0]).toBe('/employee-scheduling/work-areas');
  expect(request.mock.calls[1][1].body).toEqual({ expectedVersion: 8, areas: ['CITY_HANOI'] });
});

test('customer confirmation keeps the same slot and key after an unknown acknowledgement', async () => {
  const proposal = { id: 'proposal', version: 0, state: 'PENDING_CUSTOMER_CONFIRMATION', sitterId: 'employee',
    slots: [{ startAt: '2026-11-03T02:00:00Z', endAt: '2026-11-03T03:00:00Z' }] };
  const api = { confirmProposal: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValueOnce({ data: { offer: { state: 'PENDING' } } }) };
  render(<MemoryRouter><DirectedBookingProposalPage api={api} proposal={proposal} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('radio'));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lịch và gửi offer' }));
  await screen.findByText('Đang chờ máy chủ xác nhận'); expect(screen.getByRole('radio')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại xác nhận lịch' }));
  await waitFor(() => expect(api.confirmProposal).toHaveBeenCalledTimes(2));
  expect(api.confirmProposal.mock.calls[0]).toEqual(api.confirmProposal.mock.calls[1]);
});

test('overdue system visit proposes precise area and future time without inviting an expired shift', async () => {
  const api = fixture(), sitterId = '123456789012345678901234';
  api.queue.mockResolvedValue({ data: { workAreas: [{ code: 'CITY_HANOI', label: 'Hà Nội' }, { code: 'DISTRICT_HAI_BA_TRUNG', label: 'Hai Bà Trưng', parentCode: 'CITY_HANOI' }], items: [
    { id: 'past', serviceName: 'Ca quá hạn', version: 4, areaCode: 'CITY_HANOI', location: 'HOME', dispatchState: 'NEEDS_STAFF', reviewCode: 'SHIFT_START_REACHED', startAt: '2026-11-03T01:00:00Z', endAt: '2026-11-03T02:00:00Z' }
  ] } });
  api.candidates = jest.fn().mockResolvedValue({ data: { items: [{ sitterId, displayName: 'Nhân viên phù hợp' }], startAt: '2026-11-10T02:00:00.000Z', areaCode: 'DISTRICT_HAI_BA_TRUNG' } });
  api.propose = jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValue({ data: { id: 'proposal' } });
  render(<MemoryRouter><EmployeeDispatchPage api={api} /></MemoryRouter>);
  expect(await screen.findByText('Ca quá hạn')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Thử tìm lại' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Đổi lịch với khách'}));
  fireEvent.click(screen.getByText('Đề xuất lịch hoặc người thay thế'));
  fireEvent.change(screen.getByLabelText(/Bắt đầu đề xuất/), { target: { value: '2026-11-10T09:00' } });
  fireEvent.change(screen.getByLabelText('Khu vực tại địa chỉ đã đặt'), { target: { value: 'DISTRICT_HAI_BA_TRUNG' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra người phù hợp' }));
  await screen.findByText('Nhân viên phù hợp');
  fireEvent.change(screen.getByLabelText('Người chăm sóc cho lịch đề xuất'), { target: { value: sitterId } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất cho khách' }));
  await screen.findByText('Chưa nhận được xác nhận. Kiểm tra lại cùng yêu cầu.');
  expect(screen.getByLabelText(/Bắt đầu đề xuất/)).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại yêu cầu' }));
  await waitFor(() => expect(api.propose).toHaveBeenCalledTimes(2));
  expect(api.propose.mock.calls[0]).toEqual(api.propose.mock.calls[1]);
  expect(api.propose).toHaveBeenCalledWith('past', { expectedVersion: 4, startAt: '2026-11-10T02:00:00.000Z', areaCode: 'DISTRICT_HAI_BA_TRUNG', sitterId }, expect.any(String));
  expect(api.invite).not.toHaveBeenCalled();
});

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

test('GBR-13 tells a sitter that a concurrent acceptance took the visit and refreshes their offers', async () => {
  const api = fixture();
  api.respond.mockRejectedValueOnce({ status: 409, code: 'VISIT_ALREADY_ASSIGNED' });
  render(<EmployeeInvitationsPage api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Nhận việc' }));
  expect(await screen.findByText('Buổi đã có người nhận.')).toBeInTheDocument();
  await waitFor(() => expect(api.offers.mock.calls.length).toBeGreaterThan(1));
});
test('customer sees the previous and replacement sitter before choosing to confirm', async () => {
  const proposal = { id: 'replacement', version: 0, state: 'PENDING_CUSTOMER_CONFIRMATION', sitterId: 'new',
    previousSitterId: 'old', previousSitter: { displayName: 'Người ban đầu' }, sitter: { displayName: 'Người thay thế' },
    slots: [{ startAt: '2026-11-23T02:00:00Z', endAt: '2026-11-23T03:00:00Z' }] };
  const api = { confirmProposal: jest.fn() };
  render(<MemoryRouter><DirectedBookingProposalPage api={api} proposal={proposal} /></MemoryRouter>);
  expect(await screen.findByText('Đề xuất đổi người chăm sóc')).toBeInTheDocument();
  expect(screen.getByText(/Người đã chọn: Người ban đầu/)).toHaveTextContent('Người thay thế: Người thay thế');
  expect(api.confirmProposal).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Xác nhận lịch và gửi offer' })).toBeDisabled();
});
