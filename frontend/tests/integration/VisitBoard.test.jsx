import { beforeAll } from '@jest/globals';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VisitBoard } from '../../src/pages/staff/visit-board/VisitBoard.jsx';
import { EmployeeDispatchPage } from '../../src/pages/staff/EmployeeDispatchPage.jsx';
import { actionFor, formatDuration, formatPhone, formatReasonTime } from '../../src/utils/visit-board-format.js';
import { ApiError } from '../../src/services/api-client.js';

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

const MIN = 60000;
const workAreas = [{ code: 'DISTRICT_CAU_GIAY', label: 'Cầu Giấy' }, { code: 'DISTRICT_DONG_DA', label: 'Đống Đa' }];
// Synthetic rows. Times are Vietnam time on 04/11/2026.
const base = { version: 1, areaCode: 'DISTRICT_CAU_GIAY', state: 'ASSIGNED', reviewCode: null, serviceName: 'Chăm sóc tại nhà' };
const rows = {
  notCheckedIn: { ...base, id: 'v-51', bookingId: '6720a1b2c3d4e5f6a7b8c951', bookingCode: 'BK-0051', startAt: '2026-11-04T01:05:00Z', endAt: '2026-11-04T02:05:00Z',
    customerName: 'Ngô Minh Đức', sitterId: 's-1', sitterName: 'Trịnh Văn Hoà', reasons: [{ code: 'NOT_CHECKED_IN_30M', late: true, ms: 35 * MIN }] },
  notCheckedOut: { ...base, id: 'v-33', bookingId: '6720a1b2c3d4e5f6a7b8c933', bookingCode: 'BK-0033', startAt: '2026-11-03T23:00:00Z', endAt: '2026-11-03T23:30:00Z',
    state: 'IN_PROGRESS', customerName: 'Bùi Thanh Tâm', sitterId: 's-2', sitterName: 'Lê Văn Minh', reasons: [{ code: 'NOT_CHECKED_OUT_2H', late: true, ms: 130 * MIN }] },
  withdrawal: { ...base, id: 'v-38', bookingId: '6720a1b2c3d4e5f6a7b8c938', bookingCode: 'BK-0038', startAt: '2026-11-04T07:30:00Z', endAt: '2026-11-04T08:30:00Z',
    customerName: 'Vũ Hồng Nhung', sitterId: 's-3', sitterName: 'Đoàn Minh Khôi', reasons: [{ code: 'WITHDRAWAL_UNDER_12H', late: false, ms: 5 * 60 * MIN }] },
  noSitter: { ...base, id: 'v-42', bookingId: '6720a1b2c3d4e5f6a7b8c942', bookingCode: null, startAt: '2026-11-04T07:00:00Z', endAt: '2026-11-04T08:00:00Z', state: 'SCHEDULED',
    customerName: 'Trần Thị Lan', sitterId: null, sitterName: null, reasons: [{ code: 'NO_SITTER_24H', late: false, ms: 19 * 60 * MIN }] },
  shiftReached: { ...base, id: 'v-47', bookingId: '6720a1b2c3d4e5f6a7b8c947', bookingCode: 'BK-0047', startAt: '2026-11-04T01:50:00Z', endAt: '2026-11-04T02:50:00Z', state: 'SCHEDULED',
    reviewCode: 'SHIFT_START_REACHED', customerName: 'Đỗ Khánh Linh', sitterId: null, sitterName: null, reasons: [{ code: 'NO_SITTER_24H', late: true, ms: 50 * MIN }] },
  multi: { ...base, id: 'v-60', bookingId: '6720a1b2c3d4e5f6a7b8c960', bookingCode: 'BK-0060', startAt: '2026-11-04T01:00:00Z', endAt: '2026-11-04T02:00:00Z',
    customerName: 'Phạm Gia Hân', sitterId: 's-1', sitterName: 'Trịnh Văn Hoà', reasons: [{ code: 'NOT_CHECKED_IN_30M', late: true, ms: 40 * MIN }, { code: 'WITHDRAWAL_UNDER_12H', late: false, ms: 0 }] }
};
const needsPage = (items, extra = {}) => ({ data: { tab: 'needs-action', counts: { needsAction: items.length, needsActionLimited: false }, items, hasMore: false, ...extra } });
const allPage = (items, extra = {}) => ({ data: { tab: 'all', counts: { needsAction: 3, needsActionLimited: false }, items, hasMore: false, ...extra } });

function board(overrides = {}) {
  return {
    visitBoard: jest.fn(async params => (params.tab === 'all' ? allPage([]) : needsPage(Object.values(rows).slice(0, 5)))),
    visitContact: jest.fn().mockResolvedValue({ data: { party: 'sitter', displayName: 'Trịnh Văn Hoà', phone: '0912345678' } }),
    closureDetails: jest.fn().mockResolvedValue({ data: { ...rows.notCheckedOut, checkInAt: '2026-11-03T23:02:00Z', hasCheckInPhoto: true } }),
    closeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'v-33', state: 'STAFF_CLOSED', version: 2 } }),
    ...overrides
  };
}
function Harness({ api, todayTotal = 7, ...props }) {
  const [tab, setTab] = useState('needs');
  return <VisitBoard api={api} tab={tab} onTab={setTab} todayTotal={todayTotal} workAreas={workAreas} {...props} />;
}
const tabNamed = name => screen.getByRole('tab', { name });

describe('tabs and counts', () => {
  test('three tabs: the count of Cần xử lý comes from the API, Buổi hôm nay from the page, Tất cả buổi has none', async () => {
    render(<Harness api={board()} />);
    expect(await screen.findByRole('tab', { name: 'Cần xử lý (5)' })).toHaveAttribute('aria-selected', 'true');
    expect(tabNamed('Buổi hôm nay (7)')).toHaveAttribute('aria-selected', 'false');
    expect(tabNamed('Tất cả buổi')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  test('the counts do not change while searching or filtering', async () => {
    const api = board({ visitBoard: jest.fn(async params => needsPage(params.search ? [rows.notCheckedIn] : Object.values(rows).slice(0, 5), { counts: { needsAction: 5, needsActionLimited: false } })) });
    render(<Harness api={api} />);
    await screen.findByRole('tab', { name: 'Cần xử lý (5)' });
    fireEvent.change(screen.getByLabelText('Tìm buổi'), { target: { value: 'Ngô Minh' } });
    await waitFor(() => expect(api.visitBoard).toHaveBeenCalledWith({ tab: 'needs-action', search: 'Ngô Minh' }, expect.anything()));
    expect(await screen.findByRole('tab', { name: 'Cần xử lý (5)' })).toBeInTheDocument();
    expect(within(await screen.findByRole('region', { name: 'Buổi cần xử lý' })).getAllByRole('row')).toHaveLength(2);
  });

  test('without the board API there are two tabs and no search or filters', async () => {
    render(<Harness api={{}} todayTotal={4} />);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Cần xử lý', 'Buổi hôm nay (4)']);
    expect(screen.queryByLabelText('Tìm buổi')).not.toBeInTheDocument();
  });

  test('the Buổi hôm nay tab hides the search and filters and the lists; the page owns that section', async () => {
    const api = board();
    render(<Harness api={api} />);
    await screen.findByRole('region', { name: 'Buổi cần xử lý' });
    fireEvent.click(tabNamed('Buổi hôm nay (7)'));
    expect(screen.queryByLabelText('Tìm buổi')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Buổi cần xử lý' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tất cả buổi' })).not.toBeInTheDocument();
  });
});

describe('Cần xử lý table', () => {
  test('shows booking, customer, main reason, time, sitter and an action for each visit', async () => {
    render(<Harness api={board()} />);
    const table = within(await screen.findByRole('region', { name: 'Buổi cần xử lý' }));
    expect(table.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Buổi', 'Khách hàng', 'Lý do', 'Thời gian', 'Người chăm sóc', 'Thao tác']);
    const row = table.getByText('BK-0051').closest('tr');
    expect(within(row).getByText('Ngô Minh Đức')).toBeInTheDocument();
    expect(within(row).getByText('Chưa check-in sau 30 phút')).toBeInTheDocument();
    expect(within(row).getByText('Trễ 35 phút')).toHaveClass('visit-board__late');
    expect(within(row).getByText('Trịnh Văn Hoà')).toBeInTheDocument();
    expect(within(row).getByText('08:05 – 09:05', { exact: false })).toBeInTheDocument();
  });

  test('a visit that is not late reads "Còn …" without the late style; a booking without a code shows the end of its id', async () => {
    render(<Harness api={board()} />);
    const table = within(await screen.findByRole('region', { name: 'Buổi cần xử lý' }));
    expect(table.getByText('Còn 19 giờ')).not.toHaveClass('visit-board__late');
    expect(table.getByText('Còn 5 giờ')).toBeInTheDocument();
    expect(table.getByText('…b8c942')).toBeInTheDocument();
  });

  test('one row per visit: the main reason leads and the other reasons stay visible', async () => {
    const api = board({ visitBoard: jest.fn().mockResolvedValue(needsPage([rows.multi])) });
    render(<Harness api={api} />);
    const table = within(await screen.findByRole('region', { name: 'Buổi cần xử lý' }));
    expect(table.getAllByText('BK-0060')).toHaveLength(1);
    expect(table.getByText('Chưa check-in sau 30 phút')).toBeInTheDocument();
    expect(table.getByText('Rút buổi dưới 12 giờ')).toBeInTheDocument();
    expect(table.getByRole('button', { name: 'Gọi người chăm sóc' })).toBeInTheDocument();
  });

  test('says so when nothing needs action, and when a search matches nothing', async () => {
    const api = board({ visitBoard: jest.fn().mockResolvedValue(needsPage([])) });
    render(<Harness api={api} />);
    expect(await screen.findByText('Không có buổi nào cần xử lý.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tìm buổi'), { target: { value: 'không có' } });
    expect(await screen.findByText('Không có buổi nào khớp.')).toBeInTheDocument();
  });

  test('a note tells that the list is limited when the API says so', async () => {
    const api = board({ visitBoard: jest.fn().mockResolvedValue(needsPage([rows.notCheckedIn], { counts: { needsAction: 900, needsActionLimited: true } })) });
    render(<Harness api={api} />);
    expect(await screen.findByText(/Đang hiển thị các buổi gần giờ nhất ở mỗi lý do/)).toBeInTheDocument();
  });
});

describe('search and filters', () => {
  test('search waits for 2 characters and the filters are sent to the API', async () => {
    const api = board();
    render(<Harness api={api} />);
    await screen.findByRole('region', { name: 'Buổi cần xử lý' });
    fireEvent.change(screen.getByLabelText('Tìm buổi'), { target: { value: 'N' } });
    expect(screen.getByText('Nhập ít nhất 2 ký tự để tìm.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: 'DISTRICT_DONG_DA' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'NOT_CHECKED_IN_30M' } });
    await waitFor(() => expect(api.visitBoard).toHaveBeenLastCalledWith({ tab: 'needs-action', areaCode: 'DISTRICT_DONG_DA', reason: 'NOT_CHECKED_IN_30M' }, expect.anything()));
    expect(api.visitBoard.mock.calls.some(([params]) => 'search' in params)).toBe(false);
  });

  test('the reason filter lists the five reasons that have a data source', async () => {
    render(<Harness api={board()} />);
    await screen.findByRole('region', { name: 'Buổi cần xử lý' });
    expect(within(screen.getByLabelText('Lý do')).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Tất cả lý do', 'Hết người để mời', 'Chưa có người 24 giờ trước', 'Chưa check-in sau 30 phút', 'Rút buổi dưới 12 giờ', 'Chưa check-out sau 2 giờ']);
    expect(within(screen.getByLabelText('Khu vực phục vụ')).getAllByRole('option').map(option => option.textContent)).toEqual(['Tất cả khu vực phục vụ', 'Cầu Giấy', 'Đống Đa']);
  });

  test('the page is told which visits are listed and whether Staff are filtering', async () => {
    const onState = jest.fn();
    render(<Harness api={board()} onState={onState} />);
    await waitFor(() => expect(onState).toHaveBeenLastCalledWith({ ids: new Set(Object.values(rows).slice(0, 5).map(row => row.id)), filtering: false }));
    fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: 'DISTRICT_DONG_DA' } });
    await waitFor(() => expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ filtering: true })));
  });
});

describe('actions', () => {
  test('Giao người and Đổi lịch với khách open the dispatch dialog of the visit', async () => {
    const onOpenDispatch = jest.fn();
    render(<Harness api={board()} onOpenDispatch={onOpenDispatch} />);
    const table = within(await screen.findByRole('region', { name: 'Buổi cần xử lý' }));
    fireEvent.click(within(table.getByText('Trần Thị Lan').closest('tr')).getByRole('button', { name: 'Giao người' }));
    expect(onOpenDispatch).toHaveBeenLastCalledWith('v-42');
    fireEvent.click(within(table.getByText('Đỗ Khánh Linh').closest('tr')).getByRole('button', { name: 'Đổi lịch với khách' }));
    expect(onOpenDispatch).toHaveBeenLastCalledWith('v-47');
  });

  test('a visit outside the rows the page can open has Giao người and Đổi lịch với khách locked with the reason; the other actions stay usable', async () => {
    const onOpenDispatch = jest.fn();
    const note = 'Buổi nằm ngoài 50 ca đầu của hàng đợi. Xử lý các ca sớm hơn rồi tải lại.';
    render(<Harness api={board()} onOpenDispatch={onOpenDispatch} openableIds={new Set(['v-42', 'v-51', 'v-33', 'v-38'])} />);
    const table = within(await screen.findByRole('region', { name: 'Buổi cần xử lý' }));
    const locked = within(table.getByText('Đỗ Khánh Linh').closest('tr'));
    const button = locked.getByRole('button', { name: 'Đổi lịch với khách' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(note);
    expect(locked.getByText(note)).toBeInTheDocument();
    fireEvent.click(button);
    expect(onOpenDispatch).not.toHaveBeenCalled();
    const open = within(table.getByText('Trần Thị Lan').closest('tr'));
    expect(open.getByRole('button', { name: 'Giao người' })).toBeEnabled();
    expect(open.queryByText(note)).not.toBeInTheDocument();
    expect(table.getByRole('button', { name: 'Đóng buổi' })).toBeEnabled();
    expect(table.getByRole('button', { name: 'Gọi người chăm sóc' })).toBeEnabled();
    expect(table.getByRole('button', { name: 'Xem yêu cầu rút' })).toBeEnabled();
    expect(table.getAllByText(note)).toHaveLength(1);
  });

  test('Xem yêu cầu rút scrolls to the withdrawal requests of the page', async () => {
    const scrollIntoView = jest.fn();
    const target = document.createElement('div'); target.id = 'withdrawal-requests'; target.scrollIntoView = scrollIntoView; document.body.append(target);
    render(<Harness api={board()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu rút' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    target.remove();
  });

  test('Đóng buổi opens the close dialog; closing shows MSG71 and reloads the list and the page', async () => {
    const api = board();
    const onChanged = jest.fn();
    render(<Harness api={api} onChanged={onChanged} />);
    const row = (await screen.findByText('BK-0033')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Đóng buổi' }));
    const modal = within(await screen.findByRole('dialog'));
    fireEvent.change(await modal.findByLabelText(/Lý do/), { target: { value: 'Đã gọi xác nhận lúc 08:40.' } });
    fireEvent.click(modal.getByRole('button', { name: 'Đóng buổi' }));
    expect(await screen.findByText('Đã đóng buổi.')).toBeInTheDocument();
    expect(api.closeVisit).toHaveBeenCalledWith('v-33', { expectedVersion: 1, reason: 'Đã gọi xác nhận lúc 08:40.' }, expect.stringMatching(/^closure:/));
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.visitBoard.mock.calls.filter(([params]) => params.tab === 'needs-action').length).toBeGreaterThanOrEqual(2));
  });
});

describe('Gọi', () => {
  test('the number appears only after the click, as a phone link, and the list never had it', async () => {
    const api = board();
    render(<Harness api={api} />);
    const row = (await screen.findByText('BK-0051')).closest('tr');
    expect(row).not.toHaveTextContent(/0912/);
    expect(api.visitContact).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: 'Gọi người chăm sóc' }));
    const link = await within(row).findByRole('link', { name: '0912 345 678' });
    expect(link).toHaveAttribute('href', 'tel:0912345678');
    expect(api.visitContact).toHaveBeenCalledWith('v-51', 'sitter');
    expect(api.visitContact).toHaveBeenCalledTimes(1);
  });

  test('a sitter without a verified phone number says so', async () => {
    const api = board({ visitContact: jest.fn().mockResolvedValue({ data: { party: 'sitter', displayName: 'Trịnh Văn Hoà', phone: null } }) });
    render(<Harness api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gọi người chăm sóc' }));
    expect(await screen.findByText('Chưa có số điện thoại đã xác minh')).toBeInTheDocument();
  });

  test.each([['RESOURCE_NOT_FOUND', 404, 'Buổi này chưa có người chăm sóc để gọi.'], ['CONTACT_LOOKUP_UNAVAILABLE', 503, 'Chưa tra được số điện thoại trên hệ thống này.'],
    ['RATE_LIMITED', 429, 'Bạn xem số điện thoại quá nhanh. Thử lại sau ít phút.'], ['NETWORK_ERROR', undefined, 'Chưa lấy được số điện thoại. Thử lại.']])(
    'a %s answer shows a message and keeps the button for another try', async (code, status, message) => {
      const api = board({ visitContact: jest.fn().mockRejectedValue(new ApiError(code, status)) });
      render(<Harness api={api} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Gọi người chăm sóc' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gọi người chăm sóc' })).toBeEnabled();
    });
});

describe('real API error', () => {
  test('a failing board API shows an alert in the Cần xử lý area with a retry, and retry loads the list', async () => {
    const visitBoard = jest.fn().mockRejectedValueOnce(new ApiError('HTTP_ERROR', 500)).mockResolvedValue(needsPage([rows.notCheckedIn]));
    render(<Harness api={board({ visitBoard })} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa tải được danh sách cần xử lý.');
    expect(screen.queryByRole('region', { name: 'Buổi cần xử lý' })).not.toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('BK-0051')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a forbidden answer is also shown as an error and never as an empty list', async () => {
    const visitBoard = jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', 403));
    render(<Harness api={board({ visitBoard })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được danh sách cần xử lý.');
    expect(screen.queryByText('Không có buổi nào cần xử lý.')).not.toBeInTheDocument();
  });
});

describe('Tất cả buổi', () => {
  const visit = (id, extra = {}) => ({ ...base, id, bookingId: `6720a1b2c3d4e5f6a7b8c${id.padStart(3, '0')}`, bookingCode: `BK-${id.padStart(4, '0')}`, startAt: '2026-11-04T01:30:00Z', endAt: '2026-11-04T02:30:00Z',
    customerName: 'Ngô Minh Đức', sitterId: 's-1', sitterName: 'Trịnh Văn Hoà', ...extra });

  test('lists time, booking, service, area, sitter and state; the default note explains the order', async () => {
    const api = board({ visitBoard: jest.fn().mockResolvedValue(allPage([visit('1'), visit('2', { state: 'SCHEDULED', sitterName: null, areaCode: 'DISTRICT_DONG_DA' })])) });
    render(<Harness api={api} />);
    fireEvent.click(tabNamed('Tất cả buổi'));
    const table = within(await screen.findByRole('region', { name: 'Tất cả buổi' }));
    expect(table.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Giờ', 'Lịch đặt', 'Dịch vụ', 'Khu vực', 'Người chăm sóc', 'Trạng thái']);
    expect(table.getByText('Đống Đa')).toBeInTheDocument();
    expect(table.getByText('Chờ phân công')).toBeInTheDocument();
    expect(table.getByText('Đã nhận')).toBeInTheDocument();
    expect(screen.getByText('Các buổi từ 00:00 hôm nay trở đi, theo giờ bắt đầu.')).toBeInTheDocument();
    expect(api.visitBoard).toHaveBeenCalledWith({ tab: 'all' }, expect.anything());
  });

  test('searching says that past visits are included, newest first', async () => {
    const api = board({ visitBoard: jest.fn().mockResolvedValue(allPage([visit('1')])) });
    render(<Harness api={api} />);
    fireEvent.click(tabNamed('Tất cả buổi'));
    await screen.findByRole('region', { name: 'Tất cả buổi' });
    fireEvent.change(screen.getByLabelText('Tìm buổi'), { target: { value: 'Ngô Minh' } });
    expect(await screen.findByText('Kết quả tìm kiếm gồm cả các buổi đã qua, buổi mới nhất trước.')).toBeInTheDocument();
    expect(api.visitBoard).toHaveBeenCalledWith({ tab: 'all', search: 'Ngô Minh' }, expect.anything());
    expect(api.visitBoard.mock.calls.filter(([params]) => params.tab === 'needs-action' && params.search)).toEqual([]);
  });

  test('Tải thêm appends the next page with the cursor and disappears at the end', async () => {
    const visitBoard = jest.fn(async params => (params.cursor
      ? allPage([visit('3')])
      : allPage([visit('1'), visit('2')], { hasMore: true, nextCursor: 'cursor-1' })));
    render(<Harness api={board({ visitBoard })} />);
    fireEvent.click(tabNamed('Tất cả buổi'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(visitBoard).toHaveBeenCalledWith({ tab: 'all', cursor: 'cursor-1' }));
    expect(await screen.findByText('BK-0003')).toBeInTheDocument();
    expect(screen.getByText('BK-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  test('a failed Tải thêm keeps the rows and the button', async () => {
    const visitBoard = jest.fn(async params => {
      if (params.cursor) throw new ApiError('NETWORK_ERROR');
      return allPage([visit('1')], { hasMore: true, nextCursor: 'cursor-1' });
    });
    render(<Harness api={board({ visitBoard })} />);
    fireEvent.click(tabNamed('Tất cả buổi'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tải thêm' }));
    expect(await screen.findByText('Chưa tải thêm được. Thử lại.')).toBeInTheDocument();
    expect(screen.getByText('BK-0001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeInTheDocument();
  });

  test('an API error shows an alert with a retry', async () => {
    let failed = false;
    const visitBoard = jest.fn(async params => {
      if (params.tab === 'needs-action') return needsPage([rows.notCheckedIn]);
      if (!failed) { failed = true; throw new ApiError('HTTP_ERROR', 500); }
      return allPage([visit('1')]);
    });
    render(<Harness api={board({ visitBoard })} />);
    fireEvent.click(tabNamed('Tất cả buổi'));
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('BK-0001')).toBeInTheDocument();
  });
});

describe('the dispatch page', () => {
  const startAt = '2026-11-04T01:00:00Z';
  const legacy = id => ({ id, serviceName: `Ca ${id}`, startAt, endAt: '2026-11-04T02:00:00Z', areaCode: 'DISTRICT_CAU_GIAY', customerName: 'Khách thử', dispatchState: 'NEEDS_STAFF' });
  function pageApi(overrides = {}) {
    return { ...board(), queue: jest.fn().mockResolvedValue({ data: { items: [legacy('v-42'), legacy('legacy-only')], workAreas, today: { date: '04/11/2026', asOf: startAt, summary: { total: 7, inProgress: 1, completed: 2, late: 0 } } } }), ...overrides };
  }

  test('shows the three tabs with the counts, and the legacy queue under its own title without the visits already listed', async () => {
    render(<EmployeeDispatchPage api={pageApi()} />);
    expect(await screen.findByRole('tab', { name: 'Cần xử lý (5)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Buổi hôm nay (7)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hàng đợi tìm người của hệ thống' })).toBeVisible();
    const legacyTable = within(await screen.findByRole('region', { name: 'Ca cần điều phối' }));
    expect(legacyTable.getByText('Ca legacy-only')).toBeInTheDocument();
    expect(legacyTable.queryByText('Ca v-42')).not.toBeInTheDocument();
  });

  test('searching or filtering hides the legacy queue with a note, and clearing brings it back', async () => {
    render(<EmployeeDispatchPage api={pageApi()} />);
    await screen.findByRole('region', { name: 'Ca cần điều phối' });
    fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: 'DISTRICT_DONG_DA' } });
    expect(await screen.findByText('Đang tìm hoặc lọc, hàng đợi tìm người của hệ thống tạm ẩn.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ca cần điều phối' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: '' } });
    expect(await screen.findByRole('region', { name: 'Ca cần điều phối' })).toBeInTheDocument();
  });

  test('the legacy queue rows stay clickable and Giao người on the board opens the same dispatch dialog', async () => {
    const api = pageApi({ proposals: jest.fn(), sitters: jest.fn().mockResolvedValue({ data: { items: [] } }) });
    render(<EmployeeDispatchPage api={api} />);
    const legacyRow = (await screen.findByText('Ca legacy-only')).closest('tr');
    expect(within(legacyRow).getByRole('button')).toBeEnabled();
    fireEvent.click(within((await screen.findByText('Trần Thị Lan')).closest('tr')).getByRole('button', { name: 'Giao người' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('a board visit that is not among the loaded queue rows is locked, while the loaded ones open', async () => {
    const api = pageApi({ queue: jest.fn().mockResolvedValue({ data: { items: [legacy('v-42')], workAreas, today: { date: '04/11/2026', asOf: startAt, summary: { total: 7, inProgress: 1, completed: 2, late: 0 } } } }),
      sitters: jest.fn().mockResolvedValue({ data: { items: [] } }) });
    render(<EmployeeDispatchPage api={api} />);
    const table = within(await screen.findByRole('region', { name: 'Buổi cần xử lý' }));
    expect(within(table.getByText('Đỗ Khánh Linh').closest('tr')).getByRole('button', { name: 'Đổi lịch với khách' })).toBeDisabled();
    expect(table.getByText('Buổi nằm ngoài 50 ca đầu của hàng đợi. Xử lý các ca sớm hơn rồi tải lại.')).toBeInTheDocument();
    fireEvent.click(within(table.getByText('Trần Thị Lan').closest('tr')).getByRole('button', { name: 'Giao người' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('a board error is shown in the Cần xử lý area while the legacy queue stays usable', async () => {
    const api = pageApi({ visitBoard: jest.fn().mockRejectedValue(new ApiError('HTTP_ERROR', 500)) });
    render(<EmployeeDispatchPage api={api} />);
    expect(await screen.findByText('Chưa tải được danh sách cần xử lý.')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Cần xử lý' })).toBeInTheDocument();
    expect(within(await screen.findByRole('region', { name: 'Ca cần điều phối' })).getByText('Ca v-42')).toBeInTheDocument();
  });

  test('the Buổi hôm nay tab shows today and hides the legacy queue', async () => {
    render(<EmployeeDispatchPage api={pageApi()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Buổi hôm nay (7)' }));
    expect(screen.getByRole('heading', { name: 'Buổi hôm nay' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Ca cần điều phối' })).not.toBeInTheDocument();
  });
});

describe('format helpers', () => {
  test.each([[35 * MIN, 'Trễ 35 phút'], [130 * MIN, 'Trễ 2 giờ 10 phút'], [120 * MIN, 'Trễ 2 giờ'], [49 * 3600000, 'Trễ 2 ngày']])('late %d ms reads %s', (ms, text) =>
    expect(formatReasonTime({ late: true, ms })).toBe(text));
  test.each([[50 * MIN, 'Còn 50 phút'], [5 * 60 * MIN, 'Còn 5 giờ'], [19 * 60 * MIN, 'Còn 19 giờ'], [49 * 3600000, 'Còn 2 ngày']])('%d ms left reads %s', (ms, text) =>
    expect(formatReasonTime({ late: false, ms })).toBe(text));
  test('negative durations read as zero', () => expect(formatDuration(-5)).toBe('0 phút'));
  test.each([['0912345678', '0912 345 678'], ['02437654321', '02437654321']])('formatPhone(%s)', (input, expected) => expect(formatPhone(input)).toBe(expected));
  test('actionFor picks the action of the main reason and none for a row without reasons', () => {
    expect(actionFor(rows.noSitter)).toEqual({ kind: 'dispatch', label: 'Giao người' });
    expect(actionFor(rows.shiftReached)).toEqual({ kind: 'dispatch', label: 'Đổi lịch với khách' });
    expect(actionFor(rows.notCheckedIn)).toMatchObject({ kind: 'call', party: 'sitter' });
    expect(actionFor(rows.withdrawal)).toEqual({ kind: 'withdrawal', label: 'Xem yêu cầu rút' });
    expect(actionFor(rows.notCheckedOut)).toEqual({ kind: 'close', label: 'Đóng buổi' });
    expect(actionFor({ reasons: [] })).toBeNull();
  });
});
