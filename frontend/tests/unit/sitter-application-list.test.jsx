import { fireEvent, render, screen, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import { SitterApplicationsPage } from '../../src/pages/admin/SitterApplicationsPage.jsx';

const row = {
  id: 'application-id', displayName: 'Nguyễn Văn A', applicationCode: 'synthetic-code',
  phoneNumber: '+84912001234', contact: { channel: 'PHONE', maskedValue: '+••••••1234' }, workAreas: ['Cầu Giấy', 'Đống Đa'],
  state: 'PENDING', createdAt: '2026-10-14T00:05:00.000Z'
};

function show(list) {
  render(<MemoryRouter><SitterApplicationsPage api={{ list }} /></MemoryRouter>);
}

test('UC-17 shows the R3 columns, Vietnam time and the existing review destination', async () => {
  const list = jest.fn().mockResolvedValue({ data: { applications: [row] } });
  show(list);
  const table = await screen.findByRole('table');
  expect(within(table).getAllByRole('columnheader').map(header => header.textContent.trim())).toEqual([
    'Mã', 'Họ tên', 'Số điện thoại', 'Khu vực phục vụ', 'Ngày gửi ↑', 'Trạng thái', 'Xem'
  ]);
  for (const text of ['synthetic-code', 'Nguyễn Văn A', '0912 001 234', 'Cầu Giấy, Đống Đa', '14/10/2026 07:05']) {
    expect(within(table).getByText(text)).toBeVisible();
  }
  expect(within(table).getByRole('link', { name: 'Xem hồ sơ Nguyễn Văn A' }))
    .toHaveAttribute('href', '/admin/sitter-applications/application-id');
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ state: 'PENDING', sortOrder: 'asc' }));
});

test('UC-17 toggles server sort direction and resets the cursor', async () => {
  const list = jest.fn(async ({ cursor }) => ({ data: { applications: [row], nextCursor: cursor ? null : 'page-two' } }));
  show(list);
  const table = await screen.findByRole('table');
  expect(within(table).getByRole('columnheader', { name: 'Ngày gửi' })).toHaveAttribute('aria-sort', 'ascending');
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await screen.findByText('Trang 2');
  fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Ngày gửi' }));
  await screen.findByText('Trang 1');
  const heading = within(screen.getByRole('table')).getByRole('columnheader', { name: 'Ngày gửi' });
  expect(heading).toHaveAttribute('aria-sort', 'descending');
  expect(heading).toHaveTextContent('Ngày gửi ↓');
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '', sortOrder: 'desc' }));
});

test('UC-17 combines tab, search, service area and employment filters and returns to page one', async () => {
  const summary = { total: 25, byState: { PENDING: 22, APPROVED: 3 } };
  const serviceAreas = [{ id: 'DISTRICT_CAU_GIAY', name: 'Khu vực Cầu Giấy' }];
  const list = jest.fn(async ({ cursor }) => ({ data: { applications: [row], summary, serviceAreas, totalMatching: 22,
    nextCursor: cursor ? null : 'page-two' } }));
  show(list);
  const search = screen.getByPlaceholderText('Tìm theo tên, số điện thoại hoặc mã');
  expect(search).toHaveAttribute('maxlength', '50');
  expect(await screen.findByRole('button', { name: 'Tất cả 25' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await screen.findByText('Trang 2');
  fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: 'DISTRICT_CAU_GIAY' } });
  await screen.findByText('Trang 1');
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '', serviceArea: 'DISTRICT_CAU_GIAY' }));
  fireEvent.change(search, { target: { value: '0912' } });
  await screen.findByText('Trang 1');
  expect(screen.getByRole('button', { name: 'Tất cả 25' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Hình thức làm việc'), { target: { value: 'PART_TIME' } });
  await screen.findByText('Trang 1');
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
    cursor: '', state: 'PENDING', serviceArea: 'DISTRICT_CAU_GIAY', search: '0912', employmentType: 'PART_TIME'
  }));
});

test('GBR-25 shows the stored reapplication date and UC-17 shows MSG14 for an empty result', async () => {
  const list = jest.fn(async ({ state }) => ({ data: { applications: state === 'REJECTED'
    ? [{ ...row, state: 'REJECTED', phoneNumber: null, reapplyAt: '2026-11-12T17:30:00.000Z' }] : [],
    summary: { total: 1, byState: { REJECTED: 1 } } } }));
  show(list);
  expect(await screen.findByText('Không có đơn ứng tuyển phù hợp.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Từ chối 1' }));
  const date = await screen.findByText('13/11/2026');
  expect(date).toBeVisible();
  expect(date).toHaveAttribute('datetime', '2026-11-12T17:30:00.000Z');
  expect(date.parentElement).toHaveTextContent('Nộp lại từ 13/11/2026');
});
