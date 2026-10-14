import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminServicePricesPage } from '../../src/pages/admin/AdminServicePricesPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const service = { id: '507f1f77bcf86cd799439011', code: 'dog-walk', name: 'Dắt chó đi dạo' };

function renderPage(apiRequest, role = 'ADMIN') {
  const adapter = { resolve: async () => ({
    status: 'authenticated', user: { id: '507f1f77bcf86cd799439001', displayName: 'Synthetic User', roles: [role] }
  }) };
  return render(<SessionProvider adapter={adapter}><AdminServicePricesPage apiRequest={apiRequest} /></SessionProvider>);
}

test('Admin writes an integer VND price with explicit unit and effective time', async () => {
  const apiRequest = jest.fn(async (path, options = {}) => {
    if (path === '/services/admin') return { data: [service], status: 200 };
    if (path === '/service-prices/admin/' + service.id && !options.method) {
      return { data: { prices: [], latestVersion: 0 }, status: 200 };
    }
    if (path === '/service-prices/admin/' + service.id && options.method === 'POST') {
      return { data: { version: 1, amountVnd: 95000 }, status: 201 };
    }
    throw new Error('Unexpected price request');
  });
  renderPage(apiRequest);

  expect(await screen.findByRole('heading', { name: 'Cấu hình giá dịch vụ' })).toBeVisible();
  expect(await screen.findByText('Chưa cấu hình giá')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Giá (VND)', { exact: false }), { target: { value: '95000' } });
  fireEvent.change(screen.getByLabelText('Đơn vị áp dụng', { exact: false }), { target: { value: 'mỗi lượt' } });
  fireEvent.change(screen.getByLabelText('Lý do thay đổi', { exact: false }), { target: { value: 'Bảng giá đã được duyệt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phiên bản giá' }));

  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/service-prices/admin/' + service.id,
    expect.objectContaining({ method: 'POST', body: expect.objectContaining({
      expectedVersion: 0, amountVnd: 95000, unitLabel: 'mỗi lượt', reason: 'Bảng giá đã được duyệt',
      effectiveAt: expect.stringMatching(/Z$/)
    }) })));
  expect(await screen.findByText('Máy chủ đã ghi nhận phiên bản giá mới.')).toBeVisible();
});

test('Staff can view price history without a price editor', async () => {
  const apiRequest = jest.fn(async path => path === '/services/admin'
    ? { data: [service], status: 200 }
    : { data: { prices: [{ serviceId: service.id, version: 1, amountVnd: 95000, currency: 'VND',
      unitLabel: 'mỗi lượt', effectiveAt: '2026-10-14T00:00:00.000Z' }], latestVersion: 1 }, status: 200 });
  renderPage(apiRequest, 'STAFF');
  expect(await screen.findByText('95.000 ₫')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Lưu phiên bản giá' })).not.toBeInTheDocument();
});
