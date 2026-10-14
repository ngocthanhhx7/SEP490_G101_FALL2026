import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminServicesPage } from '../../src/pages/admin/AdminServicesPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const id = '507f1f77bcf86cd799439011';
const service = {
  id, code: 'dog-walk', version: 3, name: 'Dắt chó đi dạo', description: 'Chăm sóc ngoài trời',
  scope: 'Dắt chó theo lịch đã xác nhận.', species: ['DOG'], state: 'ACTIVE',
  effectiveAt: '2026-10-14T00:00:00.000Z', latestPolicyVersion: 2,
  policy: { version: 2, state: 'PUBLISHED', title: 'Chính sách an toàn', body: 'Thông tin đã được duyệt.',
    effectiveAt: '2026-10-14T00:00:00.000Z' }
};

function renderPage(apiRequest, role = 'ADMIN') {
  const adapter = { resolve: async () => ({
    status: 'authenticated', user: { id: '507f1f77bcf86cd799439001', displayName: 'Synthetic User', roles: [role] }
  }) };
  return render(<SessionProvider adapter={adapter}><AdminServicesPage apiRequest={apiRequest} /></SessionProvider>);
}

test('Admin sees catalog versions and submits a new effective-dated service version', async () => {
  const apiRequest = jest.fn(async (path, options = {}) => {
    if (path === '/services/admin' && !options.method) return { data: [service], status: 200 };
    if (path === '/services/admin/' + id && options.method === 'PUT') return { data: { serviceId: id, version: 4 }, status: 200 };
    throw new Error('Unexpected service request');
  });
  renderPage(apiRequest);

  expect(await screen.findByRole('heading', { name: 'Quản lý dịch vụ' })).toBeVisible();
  expect(screen.getByText('Thông tin đã được duyệt.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên bản mới' }));
  fireEvent.change(screen.getByLabelText('Tên dịch vụ', { exact: false }), { target: { value: 'Dắt chó và vận động' } });
  fireEvent.change(screen.getByLabelText('Lý do thay đổi', { exact: false }), { target: { value: 'Cập nhật phạm vi dịch vụ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phiên bản' }));

  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/services/admin/' + id, expect.objectContaining({
    method: 'PUT', body: expect.objectContaining({
      expectedVersion: 3, name: 'Dắt chó và vận động', reason: 'Cập nhật phạm vi dịch vụ',
      effectiveAt: expect.stringMatching(/Z$/)
    })
  })));
  expect(await screen.findByText('Máy chủ đã ghi nhận phiên bản dịch vụ mới.')).toBeVisible();
});

test('Staff can read published service policy but receives no editing controls', async () => {
  renderPage(jest.fn(async () => ({ data: [service], status: 200 })), 'STAFF');
  expect(await screen.findByText('Thông tin đã được duyệt.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Thêm dịch vụ' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Tạo phiên bản mới' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Xuất bản chính sách' })).not.toBeInTheDocument();
});

test.each([
  ['empty', async () => ({ data: [], status: 200 }), 'Chưa có dịch vụ'],
  ['forbidden', async () => { throw { status: 403, code: 'FORBIDDEN' }; }, 'Không có quyền xem'],
  ['error', async () => { throw { code: 'NETWORK_ERROR' }; }, 'Không tải được dịch vụ']
])('catalog page shows its %s read state', async (_state, load, message) => {
  renderPage(jest.fn(load), 'STAFF');
  expect(await screen.findByText(message)).toBeVisible();
});
