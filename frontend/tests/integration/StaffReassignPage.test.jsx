import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StaffReassignPage } from '../../src/pages/staff/StaffReassignPage.jsx';
import { NeedsActionTable } from '../../src/pages/staff/visit-board/NeedsActionTable.jsx';
import { ApiError } from '../../src/services/api-client.js';

// UC-38 Reassign Pet Sitter: R3 11.2.1, GBR-32, MSG01, MSG25, MSG45, MSG46, MSG92.
const visitId = 'a'.repeat(24), holder = 'b'.repeat(24), ok = 'c'.repeat(24), blocked = 'd'.repeat(24);
const detail = (extra = {}) => ({ data: { visit: { id: visitId, version: 4, bookingId: 'e'.repeat(24), bookingCode: 'BK-0042', serviceName: 'Chăm sóc tại nhà',
  startAt: '2026-11-24T02:00:00Z', endAt: '2026-11-24T03:00:00Z', customerName: 'Ngô Minh Đức', address: '12 Phố Huế, Hai Bà Trưng', pets: [{ name: 'Bơ', species: 'DOG' }],
  reasons: [{ code: 'NOT_CHECKED_IN_30M', late: true, ms: 35 * 60000 }] },
  currentSitter: { id: holder, displayName: 'Trịnh Văn Hoà', employmentType: 'PART_TIME', assignedAt: '2026-11-23T10:00:00Z' },
  items: [{ sitterId: ok, displayName: 'Lê Thị Mai', employmentType: 'FULL_TIME', weeklyMinutes: 130 }],
  blocked: [{ sitterId: blocked, displayName: 'Phạm Quốc Bảo', reason: 'DAY_OFF' }], ...extra } });
function Back() { const { state, search } = useLocation(); return <p>Điều phối ca · {state?.reassigned} · {search}</p>; }
function setup(api, state) {
  render(<MemoryRouter initialEntries={[{ pathname: `/staff/visits/${visitId}/reassign`, state }]}><Routes>
    <Route path="/staff/visits/:id/reassign" element={<StaffReassignPage api={api} visitId={visitId} />} />
    <Route path="/staff/dispatch" element={<Back />} /></Routes></MemoryRouter>);
}
const apiOf = (extra = {}) => ({ reassignment: jest.fn().mockResolvedValue(detail()), reassign: jest.fn().mockResolvedValue({ data: { visitId, version: 5, sitterId: ok, sitterName: 'Lê Thị Mai', startAt: '2026-11-24T02:00:00Z' } }),
  visitContact: jest.fn(), ...extra });
const pick = async () => fireEvent.click(await screen.findByRole('radio', { name: /Lê Thị Mai/ }));
const reasonBox = () => screen.getByLabelText(/Lý do đổi người/);

test('UC-38 shows the visit, the current sitter, who can take it and why the others cannot', async () => {
  setup(apiOf());
  expect(await screen.findByRole('heading', { level: 2, name: 'Buổi cần đổi người' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: 'Đổi người chăm sóc' })).toBeVisible();
  expect(screen.getByText('24/11/2026 · 09:00 – 10:00')).toBeVisible();
  expect(screen.getByText('Chưa check-in sau 30 phút')).toBeVisible(); expect(screen.getByText('Trễ 35 phút')).toBeVisible();
  expect(screen.getByText('Trịnh Văn Hoà')).toBeVisible(); expect(screen.getByRole('button', { name: 'Gọi Trịnh Văn Hoà' })).toBeVisible();
  const radio = screen.getByRole('radio', { name: /Lê Thị Mai/ });
  expect(within(radio.closest('label')).getByText('Nhận được')).toBeVisible();
  fireEvent.click(screen.getByText('Chưa đủ điều kiện (1)'));
  expect(screen.getByText('Đã đăng ký nghỉ')).toBeVisible();
  expect(screen.getByRole('radio', { name: 'Phạm Quốc Bảo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Đổi người chăm sóc' })).toBeDisabled();
  expect(screen.getByText(/Khách và cả hai người chăm sóc được báo/)).toBeVisible();
});

test('UC-38 MSG01: an empty reason is refused under the box and nothing is sent', async () => {
  const api = apiOf(); setup(api); await pick();
  fireEvent.click(screen.getByRole('button', { name: 'Đổi người chăm sóc' }));
  expect(await screen.findByText('Vui lòng nhập thông tin này.')).toBeVisible();
  expect(reasonBox()).toHaveFocus(); expect(api.reassign).not.toHaveBeenCalled();
});

test('UC-38 MSG92: a successful change goes back to the dispatch page with the confirmation, sent once', async () => {
  const api = apiOf(); setup(api, { returnTo: '/staff/dispatch?tab=needs&q=Hoa' }); await pick();
  fireEvent.change(reasonBox(), { target: { value: '  Người cũ báo ốm  ' } });
  const submit = screen.getByRole('button', { name: 'Đổi người chăm sóc' });
  fireEvent.click(submit); fireEvent.click(submit);
  expect(await screen.findByText(/Lê Thị Mai đã nhận buổi ngày 24\/11\/2026 lúc 09:00\. Khách và cả hai người chăm sóc đã được báo\./)).toBeVisible();
  expect(screen.getByText(/\?tab=needs&q=Hoa/)).toBeVisible();
  expect(api.reassign).toHaveBeenCalledTimes(1);
  expect(api.reassign).toHaveBeenCalledWith(visitId, { expectedVersion: 4, sitterId: ok, reason: 'Người cũ báo ốm' }, expect.stringMatching(/^reassign:/));
});

test.each([
  ['MSG25', new ApiError('REASSIGN_VISIT_CHANGED', 409, { sitterName: 'Võ Anh Tuấn' }), 'Buổi này vừa được giao cho Võ Anh Tuấn. Trang đã cập nhật thông tin mới nhất.'],
  ['MSG45', new ApiError('REASSIGN_SITTER_NOT_ELIGIBLE', 409, { sitterName: 'Lê Thị Mai', reasonCode: 'DAY_OFF' }), 'Lê Thị Mai không còn nhận được buổi này (Đã đăng ký nghỉ). Vui lòng chọn người chăm sóc khác.'],
  ['MSG46', new ApiError('REASSIGN_SITTER_BUSY', 409, { sitterName: 'Lê Thị Mai' }), 'Lê Thị Mai đã có buổi khác vào giờ này nên không thể chọn.']
])('UC-38 %s is shown, the choice is cleared and the page reloads', async (_code, error, text) => {
  const api = apiOf({ reassign: jest.fn().mockRejectedValue(error) }); setup(api); await pick();
  fireEvent.change(reasonBox(), { target: { value: 'Lý do' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đổi người chăm sóc' }));
  expect(await screen.findByText(text)).toBeVisible();
  await waitFor(() => expect(api.reassignment).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('radio', { name: /Lê Thị Mai/ })).not.toBeChecked();
});

test('UC-38 Quay lại sends nothing and returns to the board the staff came from', async () => {
  const api = apiOf(); setup(api, { returnTo: '/staff/dispatch?tab=all' }); await screen.findByRole('radio', { name: /Lê Thị Mai/ });
  fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
  expect(await screen.findByText(/\?tab=all/)).toBeVisible();
  expect(api.reassign).not.toHaveBeenCalled();
});

test('UC-38 states: nothing to choose, loading failure and a visit that cannot change any more', async () => {
  const { unmount } = render(<MemoryRouter><StaffReassignPage api={apiOf({ reassignment: jest.fn().mockResolvedValue(detail({ items: [] })) })} visitId={visitId} /></MemoryRouter>);
  expect(await screen.findByText('Chưa có người chăm sóc nào nhận được buổi này.')).toBeVisible();
  unmount();
  const failing = apiOf({ reassignment: jest.fn().mockRejectedValue(new ApiError('HTTP_ERROR', 500)) });
  const second = render(<MemoryRouter><StaffReassignPage api={failing} visitId={visitId} /></MemoryRouter>);
  expect(await screen.findByText('Chưa tải được buổi.')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  await waitFor(() => expect(failing.reassignment).toHaveBeenCalledTimes(2));
  second.unmount();
  render(<MemoryRouter><StaffReassignPage api={apiOf({ reassignment: jest.fn().mockRejectedValue(new ApiError('VISIT_NOT_REASSIGNABLE', 409)) })} visitId={visitId} /></MemoryRouter>);
  expect(await screen.findByText('Buổi này không còn đổi người được.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Về Điều phối ca' })).toHaveAttribute('href', '/staff/dispatch');
});

describe('UC-38 entry points on the Needs action list', () => {
  const row = (code, extra = {}) => ({ id: 'f'.repeat(24), bookingId: 'e'.repeat(24), state: 'ASSIGNED', sitterId: holder, sitterName: 'Trịnh Văn Hoà', customerName: 'Ngô Minh Đức', areaCode: 'X',
    startAt: '2026-11-24T02:00:00Z', endAt: '2026-11-24T03:00:00Z', reasons: [{ code, late: false, ms: 3600000 }], ...extra });
  const show = rows => render(<MemoryRouter><NeedsActionTable list={{ status: 'success', data: { counts: {} } }} rows={rows} filtering={false} api={{ visitContact: jest.fn() }}
    workAreas={[]} onAction={jest.fn()} returnTo="/staff/dispatch?tab=needs" /></MemoryRouter>);
  test.each(['WITHDRAWAL_UNDER_12H', 'NOT_CHECKED_IN_30M', 'HANDOVER_NOT_CONFIRMED_1H'])('%s offers Giao lại next to the existing action', code => {
    show([row(code)]);
    expect(screen.getByRole('link', { name: 'Giao lại' })).toHaveAttribute('href', `/staff/visits/${'f'.repeat(24)}/reassign`);
    expect(screen.getByRole('button', { name: code === 'WITHDRAWAL_UNDER_12H' ? 'Xem yêu cầu rút' : 'Gọi người chăm sóc' })).toBeVisible();
  });
  test('other reasons and visits without a sitter do not', () => {
    show([row('NOT_CHECKED_OUT_2H', { state: 'IN_PROGRESS' }), row('NO_SITTER_24H', { id: '9'.repeat(24), state: 'SCHEDULED', sitterId: null })]);
    expect(screen.queryByRole('link', { name: 'Giao lại' })).not.toBeInTheDocument();
  });
});
