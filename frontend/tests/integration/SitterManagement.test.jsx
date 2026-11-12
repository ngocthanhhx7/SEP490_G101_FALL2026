import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll } from '@jest/globals';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SitterManagementPage } from '../../src/pages/staff/SitterManagementPage.jsx';
import { SitterManagementDetailPage } from '../../src/pages/staff/SitterManagementDetailPage.jsx';
import { EmployeeDispatchPage } from '../../src/pages/staff/EmployeeDispatchPage.jsx';
import { createSitterManagementApi } from '../../src/services/sitter-management-api.js';

const id = 'a'.repeat(24), appId = 'b'.repeat(24);
const sitter = { id, displayName: 'Nguyễn Hà (Demo)', accountState: 'ACTIVE', demo: true, status: 'ACTIVE', profileState: 'APPROVED',
  areas: ['DISTRICT_TAY_HO'], employmentType: 'PART_TIME', capabilityActive: true };
const area = { code: 'DISTRICT_TAY_HO', label: 'Khu vực Tây Hồ' };
const asOf = '2026-10-30T10:00:00Z';
beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  window.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});
function fixture() {
  return {
    list: jest.fn().mockResolvedValue({ data: { items: [sitter], total: 42, areas: [area], nextCursor: 'next', asOf } }),
    reports: jest.fn().mockResolvedValue({ data: { asOf, from: '2026-10-01', to: '2026-10-30', counts: { total: 42, real: 0, demo: 42, active: 42, suspended: 0, missingContract: 0 },
      visitsAvailable: true, work: [], coverage: [{ code: area.code, count: 2 }] } }),
    get: jest.fn().mockResolvedValue({ data: { ...sitter, asOf, areaCatalog: [area], statusVersion: 2, contracts: [{ employmentType: 'PART_TIME', weeklyMinutes: 1200, effectiveAt: asOf, version: 1 }],
      application: { id: appId, experience: 'Kinh nghiệm mẫu', requestedServices: ['home-care'], workAreas: [area.code], ageEligible: true },
      profile: { bio: 'Giới thiệu mẫu', state: 'APPROVED', areas: [area.code] }, capabilities: { active: true, maxPets: 2, maxWeightKg: 15, species: ['DOG'], areas: [area.code], allowedTraits: [], services: [] },
      rating: { available: true, count: 0, average: null },
      availability: { state: 'ACTIVE', workingWindows: [{ weekday: 2, startLocalTime: '08:00', endLocalTime: '12:00' }], areas: [area.code], dayOffDates: [] },
      audit: [], contractVersion: 1, permissions: { manageContract: true, manageStatus: true, reviewApplication: true } } }),
    activity: jest.fn().mockResolvedValue({ data: { items: [], from: '2026-10-01', to: '2026-10-30', nextCursor: null, asOf } }),
    changeStatus: jest.fn().mockResolvedValue({ data: { status: 'SUSPENDED', version: 3 } })
  };
}
function mount(api, detail = false, payrollApi) {
  render(<MemoryRouter initialEntries={[detail ? '/admin/sitters/' + id : '/admin/sitters']}><Routes>
    <Route path="/admin/sitters" element={<SitterManagementPage api={api} />} />
    <Route path="/admin/sitters/:userId" element={<SitterManagementDetailPage api={api} payrollApi={payrollApi} />} />
  </Routes></MemoryRouter>);
}
test('operational table, truthful source counts, filters, cursor reset and detail navigation', async () => {
  const api = fixture(); mount(api);
  await screen.findByText('Nguyễn Hà (Demo)');
  expect(screen.getByRole('table')).toBeInTheDocument(); expect(screen.getByText('0 hồ sơ thực · 42 hồ sơ Demo')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Trang sau'));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next' }), expect.anything()));
  fireEvent.change(screen.getByLabelText('Nguồn dữ liệu'), { target: { value: 'REAL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lọc' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '', source: 'REAL' }), expect.anything()));
  fireEvent.click(await screen.findByText('Nguyễn Hà (Demo)'));
  await screen.findByText('Kinh nghiệm mẫu'); expect(api.get).toHaveBeenCalledWith(id, expect.anything());
});
test('profile tabs show contracts, time windows, ratings without invented history and scoped activity', async () => {
  const api = fixture(); mount(api, true);
  await screen.findByText('Chưa có đánh giá đã công khai');
  fireEvent.click(screen.getByRole('button', { name: 'Năng lực và hợp đồng' }));
  expect(screen.getByText('20 giờ')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lịch làm việc' }));
  expect(screen.getByText('08:00')).toBeInTheDocument(); expect(screen.getByText('Thứ 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Công việc' })); await screen.findByText('Chưa có công việc trong kỳ.');
  fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
  await waitFor(() => expect(api.activity).toHaveBeenLastCalledWith(id, expect.objectContaining({ days: 7, cursor: '' }), expect.anything()));
});
test('uncertain status response freezes reason and retries the identical version and operation key', async () => {
  const api = fixture(); api.changeStatus.mockRejectedValueOnce({ code: 'TIMEOUT' }); mount(api, true);
  fireEvent.click(await screen.findByRole('button', { name: 'Tạm ngưng' }));
  fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Lý do mẫu hợp lệ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
  await screen.findByText('Chưa hoàn tất'); expect(screen.getByLabelText('Lý do')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại cùng thao tác' }));
  await waitFor(() => expect(api.changeStatus).toHaveBeenCalledTimes(2));
  expect(api.changeStatus.mock.calls[0]).toEqual(api.changeStatus.mock.calls[1]);
  expect(api.changeStatus.mock.calls[0][0]).toMatchObject({ applicationId: appId, expectedVersion: 2, action: 'SUSPEND' });
});
test('Staff projection hides Admin commands and application link', async () => {
  const api = fixture(), data = (await api.get()).data; data.permissions = { manageStatus: false, reviewApplication: false };
  delete data.application.id; api.get.mockResolvedValue({ data }); mount(api, true);
  await screen.findByText('Kinh nghiệm mẫu');
  expect(screen.queryByRole('button', { name: 'Tạm ngưng' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Hồ sơ ứng tuyển' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Năng lực và hợp đồng' }));
  expect(screen.queryByRole('button', { name: 'Xác minh hợp đồng đã ký' })).not.toBeInTheDocument();
});
test('API adapter rejects malformed projections and status pending responses', async () => {
  const request = jest.fn().mockResolvedValue({ data: { asOf, items: [], total: -1 } }); const api = createSitterManagementApi(request);
  await expect(api.list({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  request.mockResolvedValue({ pending: true });
  await expect(api.changeStatus({ applicationId: appId, idempotencyKey: 'stable-key' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('Admin records a contract for the selected sitter with the server version and retries the same uncertain command', async () => {
  const api = fixture(), data = (await api.get()).data;
  data.contracts = []; data.contractVersion = 3; api.get.mockResolvedValue({ data });
  const payroll = { contract: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValueOnce({ id: appId, version: 4 }) };
  mount(api, true, payroll);
  await screen.findByText('Kinh nghiệm mẫu');
  fireEvent.click(screen.getByRole('button', { name: 'Năng lực và hợp đồng' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh hợp đồng đã ký' }));
  expect(screen.getByLabelText('Mã nhân viên')).toHaveValue(id);
  expect(screen.getByLabelText('Mã nhân viên')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Phiên bản hợp đồng hiện tại')).toHaveValue(3);
  const form = screen.getByText('Lưu hợp đồng đã xác minh').closest('form');
  for (const [name, value] of Object.entries({ weeklyMinutes: '2400', signedAt: '2026-10-01', effectiveAt: '2026-10-30',
    contractReference: 'synthetic-signed', workplaceRegion: '1', workplaceReference: 'Synthetic verified workplace' }))
    fireEvent.change(form.elements[name], { target: { value } });
  fireEvent.submit(form);
  await screen.findByText('Chưa lưu hợp đồng');
  expect(screen.getByLabelText('Ngày ký')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại cùng yêu cầu' }));
  await waitFor(() => expect(payroll.contract).toHaveBeenCalledTimes(2));
  expect(payroll.contract.mock.calls[0]).toEqual(payroll.contract.mock.calls[1]);
  expect(payroll.contract.mock.calls[0][0]).toMatchObject({ employeeId: id, expectedVersion: 3 });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
});
test('selected sitter reaches invitation command and cannot replace customer directed choice', async () => {
  const invite = jest.fn().mockResolvedValue({ data: { state: 'PENDING' } }), api = { invite,
    plans: async () => ({ data: { items: [] } }), queue: async () => ({ data: { items: [
      { id: 'visit1', version: 4, dispatchState: 'NEEDS_STAFF', serviceName: 'Ca hệ thống', startAt: asOf, endAt: asOf },
      { id: 'visit2', version: 5, dispatchState: 'NEEDS_STAFF', serviceName: 'Ca chỉ định khác', requestedSitterId: appId, startAt: asOf, endAt: asOf }
    ] } }) };
  render(<MemoryRouter><EmployeeDispatchPage api={api} selectedSitter={id} /></MemoryRouter>);
  const rows = await screen.findAllByRole('button', {name:'Xem / xử lý'});
  fireEvent.click(rows[1]); expect(screen.getByRole('button',{name:'Mời người đã chọn'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Đóng'}));
  fireEvent.click(rows[0]); fireEvent.click(screen.getByRole('button',{name:'Mời người đã chọn'}));
  await waitFor(() => expect(invite).toHaveBeenCalledWith('visit1', 4, expect.any(String), id));
});


test('Staff can verify actual newcomer capability without manufacturing ratings or origins', async () => {
  const api = fixture(), data = (await api.get()).data;
  data.permissions.manageCapability = true; data.capabilities = null;
  data.serviceCatalog = [{ id: 'd'.repeat(24), code: 'nail-trimming', name: 'Cắt móng' }];
  data.traitCatalog = [{ code: 'slow-introduction', label: 'Cần làm quen chậm' }];
  api.get.mockResolvedValue({ data }); api.saveCapability = jest.fn().mockResolvedValue({ data: { userId: id, version: 1 } });
  mount(api, true); await screen.findByText('Kinh nghiệm mẫu');
  fireEvent.click(screen.getByRole('button', { name: 'Năng lực và hợp đồng' }));
  fireEvent.click(screen.getByLabelText('Cắt móng')); fireEvent.click(screen.getByLabelText('Chó'));
  fireEvent.change(screen.getByLabelText(/Căn cứ xác minh \/ lý do/), { target: { value: 'Đã kiểm tra kỹ năng thực tế' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu xác minh năng lực' }).closest('form'));
  await waitFor(() => expect(api.saveCapability).toHaveBeenCalledWith(id, expect.objectContaining({ expectedVersion: 0, species: ['DOG'], serviceIds: ['d'.repeat(24)], reason: 'Đã kiểm tra kỹ năng thực tế' }), expect.any(String)));
  expect(api.saveCapability.mock.calls[0][1]).not.toHaveProperty('starts');
  expect(api.saveCapability.mock.calls[0][1]).not.toHaveProperty('rating');
});

function mountStaff(api) {
  render(<MemoryRouter initialEntries={['/staff/sitters']}><Routes>
    <Route path="/staff/sitters" element={<SitterManagementPage api={api} />} />
  </Routes></MemoryRouter>);
}

const staffRow = { ...sitter, code: 'NV-TEST-001', workingWindows: [{ weekday: 1, startLocalTime: '08:00', endLocalTime: '12:00' }],
  shift: null, approvedLeave: null, withdrawals: null, rating: 4.5, lateCheckIns: 2 };
const staffData = { asOf, total: 24, areas: [area], tabCounts: { all: 24, partTime: 16, fullTime: 8 },
  withdrawalsAvailable: false, nextCursor: null };

test('UC-74 Staff tabs and filters combine in the list request and clear the cursor', async () => {
  const api = fixture();
  api.list.mockResolvedValue({ data: { ...staffData, items: [staffRow], nextCursor: 'next' } });
  mountStaff(api);
  expect(await screen.findByRole('button', { name: 'Tất cả (24)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Toàn thời gian (8)' })).toBeVisible();
  expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ view: 'staffList', status: 'ACTIVE', sort: 'rating', limit: 20 }), expect.anything());
  fireEvent.click(screen.getByLabelText('Trang sau'));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next' }), expect.anything()));
  fireEvent.click(await screen.findByRole('button', { name: 'Bán thời gian (16)' }));
  const search = screen.getByPlaceholderText('Tìm theo tên, mã hoặc số điện thoại');
  fireEvent.change(search, { target: { value: '0912' } });
  fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: area.code } });
  fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'lateCheckIns' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({
    cursor: '', employmentType: 'PART_TIME', search: '0912', area: area.code, sort: 'lateCheckIns'
  }), expect.anything()));
  expect(await screen.findByRole('button', { name: 'Bán thời gian (16)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('option', { name: 'Sắp xếp: rút buổi' })).toBeDisabled();
});

test('UC-74 shows real hours, unavailable sources, late-count thresholds and MSG132', async () => {
  const api = fixture();
  const another = { ...staffRow, id: 'c'.repeat(24), displayName: 'Trần Bình', code: 'NV-TEST-002', employmentType: 'FULL_TIME',
    rating: null, lateCheckIns: 1, workingWindows: [] };
  const missing = { ...staffRow, id: 'd'.repeat(24), displayName: 'Phạm C', code: 'DDDDDD', workingWindows: [], lateCheckIns: 0 };
  api.list.mockImplementation(async ({ search }) => ({ data: { ...staffData,
    items: search ? [] : [staffRow, another, missing], total: search ? 0 : 3 } }));
  mountStaff(api);
  const row = await screen.findByRole('row', { name: /NV-TEST-001/ });
  expect(within(row).getByText(/08:00–12:00/)).toBeVisible();
  expect(within(row).getAllByText('Chưa có dữ liệu')).toHaveLength(2);
  expect(within(row).getByText('★ 4,5')).toBeVisible();
  expect(within(row).getByText('2')).toHaveClass('staff-sitter-count--alert');
  expect(within(row).getByRole('link', { name: /Xem/ })).toHaveAttribute('href', '/staff/sitters/' + id);
  const fullTime = screen.getByRole('row', { name: /NV-TEST-002/ });
  expect(within(fullTime).getByText('Chưa có lịch ca')).toBeVisible();
  expect(within(fullTime).getByText('Chưa có')).toBeVisible();
  expect(within(fullTime).getByText('1')).not.toHaveClass('staff-sitter-count--alert');
  const noHours = screen.getByRole('row', { name: /DDDDDD/ });
  expect(within(noHours).getByText('Chưa đặt giờ làm')).toBeVisible();
  expect(within(noHours).getByText('0')).not.toHaveClass('staff-sitter-count--alert');
  fireEvent.change(screen.getByPlaceholderText('Tìm theo tên, mã hoặc số điện thoại'), { target: { value: 'ZZZ' } });
  expect(await screen.findByText('Không có người chăm sóc phù hợp.')).toBeVisible();
  expect(screen.getByLabelText('Trang sau')).toBeDisabled();
});

test.each([['Staff', mountStaff, false], ['Admin', mount, true]])(
  'UC-74 %s report keeps period controls and shows summary cards only in Admin',
  async (_role, renderList, showMetrics) => {
    const api = fixture();
    if (!showMetrics) api.list.mockResolvedValue({ data: { ...staffData, items: [staffRow] } });
    renderList(api);
    const report = within(screen.getByRole('region', { name: 'Báo cáo người chăm sóc' }));
    await report.findByText(/^Cập nhật /);
    for (const label of ['Người chăm sóc', 'Đang hoạt động', 'Tạm ngưng', 'Thiếu hợp đồng hiệu lực']) {
      if (showMetrics) expect(report.getByText(label, { exact: true })).toBeVisible();
      else expect(report.queryByText(label, { exact: true })).not.toBeInTheDocument();
    }
    fireEvent.click(report.getByText('Báo cáo công việc và phân bố khu vực'));
    expect(report.getByRole('button', { name: '30 ngày' })).toHaveAttribute('aria-pressed', 'true');
    for (const days of [7, 90]) {
      fireEvent.click(report.getByRole('button', { name: days + ' ngày' }));
      await waitFor(() => expect(api.reports).toHaveBeenLastCalledWith(expect.objectContaining({ days }), expect.anything()));
    }
  }
);
