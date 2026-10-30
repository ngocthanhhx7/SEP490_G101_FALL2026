import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import { SitterApplicationsPage } from '../../src/pages/admin/SitterApplicationsPage.jsx';

describe('Admin sitter application list', () => {
  test('shows loading, empty and populated states without exposing an unmasked contact', async () => {
    const api = { list: jest.fn()
      .mockResolvedValueOnce({ data: { applications: [], nextCursor: null } })
      .mockResolvedValueOnce({ data: { applications: [{ id: 'application-id', displayName: 'Nguyễn Văn A',
        contact: { channel: 'EMAIL', maskedValue: 's•••@example.test' }, workAreas: ['Quận 1'],
        state: 'PENDING', createdAt: '2026-10-14T00:00:00.000Z' }], nextCursor: null } }) };
    const view = render(<MemoryRouter><SitterApplicationsPage api={api} /></MemoryRouter>);
    await screen.findByText('Không tìm thấy hồ sơ phù hợp bộ lọc.');
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới danh sách' }));
    expect(await screen.findByRole('link', { name: 'Nguyễn Văn A' })).toHaveAttribute('href', '/admin/sitter-applications/application-id');
    expect(screen.getByText('s•••@example.test · Email')).toBeInTheDocument();
    expect(screen.queryByText('sitter@example.test')).not.toBeInTheDocument();
    view.unmount();
  });
});

test('uses server totals, supports pagination and resets cursor when filters change', async () => {
  const summary = { total: 25, byState: { PENDING: 22, UNDER_REVIEW: 0, INTERVIEW: 0, APPROVED: 3, REJECTED: 0 } };
  const api = { list: jest.fn(async ({ cursor }) => ({ data: { applications: [], summary, totalMatching: 22,
    nextCursor: cursor ? null : 'page-two' } })) };
  render(<MemoryRouter><SitterApplicationsPage api={api} /></MemoryRouter>);
  expect(await screen.findByText('22 hồ sơ phù hợp · Mới nhất trước')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tất cả hồ sơ 25' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await screen.findByText('Trang 2');
  expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'page-two', state: 'PENDING' }));
  fireEvent.change(screen.getByLabelText('Hình thức làm việc'), { target: { value: 'PART_TIME' } });
  await screen.findByText('Trang 1');
  expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: '', employmentType: 'PART_TIME' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
  await screen.findByText('Trang 1');
  expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ state: '', search: '', employmentType: '', cursor: '' }));
});
