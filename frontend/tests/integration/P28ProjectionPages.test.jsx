import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectionPage } from '../../src/pages/dashboards/ProjectionPage.jsx';
import { useSession } from '../../src/contexts/SessionContext.jsx';
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: jest.fn() }));
const id = 'a'.repeat(24);
const session = roles => ({ status: 'authenticated', user: { id, roles } });
const result = { data: { kind: 'earnings', asOf: '2026-10-18T17:00:00Z', metrics: [], items: [], nextCursor: null } };
beforeEach(() => useSession.mockReturnValue(session(['PET_SITTER'])));
const page = api => <ProjectionPage api={api} roles={['PET_SITTER']} kind="earnings" title="Thu nhập" description="Theo sổ" />;
test('loading to empty; Vietnam timestamp crosses Monday midnight', async () => {
  let resolve;
  const api = { read: jest.fn(() => new Promise(done => { resolve = done; })) };
  render(page(api));
  expect(screen.getByText('Đang tải dữ liệu')).toBeInTheDocument();
  await waitFor(() => expect(api.read).toHaveBeenCalled());
  await act(async () => resolve(result));
  expect(screen.getByText('Chưa có dữ liệu trong phạm vi đã chọn')).toBeInTheDocument();
  expect(screen.getByText(/Cập nhật.*19.*10.*2026/)).toBeInTheDocument();
});
test.each(['pending', 'forbidden', 'error'])('%s never renders private data', async state => {
  const api = { read: jest.fn(() => state === 'pending' ? Promise.resolve({ pending: true })
    : Promise.reject({ status: state === 'forbidden' ? 403 : 503 })) };
  render(page(api));
  expect(await screen.findByText(state === 'pending' ? 'Đang chờ tích hợp dữ liệu'
    : state === 'forbidden' ? 'Bạn không có quyền xem dữ liệu này' : 'Không thể tải dữ liệu')).toBeInTheDocument();
});
test('unauthorized role makes no request', () => {
  useSession.mockReturnValue(session(['STAFF']));
  const api = { read: jest.fn() }; render(page(api));
  expect(api.read).not.toHaveBeenCalled();
});
test('pagination passes cursor, filter apply resets cursor', async () => {
  const api = { read: jest.fn(async () => ({ data: { ...result.data, nextCursor: 'next_page' } })) };
  render(page(api)); await screen.findByText('Chưa có dữ liệu trong phạm vi đã chọn');
  fireEvent.click(screen.getByRole('button', { name: 'Trang tiếp' }));
  await waitFor(() => expect(api.read).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next_page' })));
  fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-18' } });
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
  await waitFor(() => expect(api.read).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-18' })));
  expect(api.read.mock.calls.at(-1)[0]).not.toHaveProperty('cursor');
});
test('obsolete read cannot replace a newer filter result; account changes clear data', async () => {
  let resolveOld;
  const api = { read: jest.fn().mockImplementationOnce(() => new Promise(done => { resolveOld = done; }))
    .mockResolvedValue({ data: { ...result.data, items: [{ id, displayName: 'Current' }] } }) };
  const view = render(page(api)); await waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
  await screen.findByText('Current');
  await act(async () => resolveOld({ data: { ...result.data, items: [{ id, displayName: 'Stale' }] } }));
  expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  useSession.mockReturnValue({ status: 'guest' }); view.rerender(page(api));
  expect(screen.queryByText('Current')).not.toBeInTheDocument();
});
