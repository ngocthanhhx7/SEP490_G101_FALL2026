import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      audit: [], permissions: { manageStatus: true, reviewApplication: true } } }),
    activity: jest.fn().mockResolvedValue({ data: { items: [], from: '2026-10-01', to: '2026-10-30', nextCursor: null, asOf } }),
    changeStatus: jest.fn().mockResolvedValue({ data: { status: 'SUSPENDED', version: 3 } })
  };
}
function mount(api, detail = false) {
  render(<MemoryRouter initialEntries={[detail ? '/admin/sitters/' + id : '/admin/sitters']}><Routes>
    <Route path="/admin/sitters" element={<SitterManagementPage api={api} />} />
    <Route path="/admin/sitters/:userId" element={<SitterManagementDetailPage api={api} />} />
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
});
test('API adapter rejects malformed projections and status pending responses', async () => {
  const request = jest.fn().mockResolvedValue({ data: { asOf, items: [], total: -1 } }); const api = createSitterManagementApi(request);
  await expect(api.list({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  request.mockResolvedValue({ pending: true });
  await expect(api.changeStatus({ applicationId: appId, idempotencyKey: 'stable-key' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
test('selected sitter reaches invitation command and cannot replace customer directed choice', async () => {
  const invite = jest.fn().mockResolvedValue({ data: { state: 'PENDING' } }), api = { invite,
    plans: async () => ({ data: { items: [] } }), queue: async () => ({ data: { items: [
      { id: 'visit1', version: 4, serviceName: 'Ca hệ thống', startAt: asOf, endAt: asOf },
      { id: 'visit2', version: 5, serviceName: 'Ca chỉ định khác', requestedSitterId: appId, startAt: asOf, endAt: asOf }
    ] } }) };
  render(<MemoryRouter><EmployeeDispatchPage api={api} selectedSitter={id} /></MemoryRouter>);
  const buttons = await screen.findAllByRole('button', { name: 'Mời người đã chọn' });
  expect(buttons[1]).toBeDisabled(); fireEvent.click(buttons[0]);
  await waitFor(() => expect(invite).toHaveBeenCalledWith('visit1', 4, expect.any(String), id));
});
