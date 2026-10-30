import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EmployeeInvitationsPage } from '../../src/pages/sitter/EmployeeInvitationsPage.jsx';
import { EmployeeDispatchPage } from '../../src/pages/staff/EmployeeDispatchPage.jsx';
import { createEmployeeSchedulingApi } from '../../src/services/employee-scheduling-api.js';
import { MemoryRouter } from 'react-router-dom';
import { DirectedBookingProposalPage } from '../../src/pages/customer/DirectedBookingProposalPage.jsx';
import { StaffTravelMonitor } from '../../src/pages/staff/StaffTravelMonitor.jsx';

afterEach(cleanup);
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
  expect(await screen.findByText('Hệ thống đang tìm người nhận ca')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Xác nhận kế hoạch' })).not.toBeInTheDocument();
  expect(api.plans).not.toHaveBeenCalled(); expect(api.finalize).not.toHaveBeenCalled();
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
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lịch và gửi offer' }));
  await waitFor(() => expect(api.confirmProposal).toHaveBeenCalledTimes(2));
  expect(api.confirmProposal.mock.calls[0]).toEqual(api.confirmProposal.mock.calls[1]);
});
