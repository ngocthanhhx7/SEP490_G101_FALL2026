import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminSystemSettingsPage } from '../../src/pages/admin/AdminSystemSettingsPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const overview = {
  currency: { code: 'VND', unitVnd: 1, input: 'NON_NEGATIVE_INTEGER', rounding: 'REJECT_FRACTIONAL_NO_ROUNDING' },
  catalogVisibility: { key: 'SERVICE_CATALOG_VISIBLE', version: 2, enabled: true,
    effectiveAt: '2026-10-14T00:00:00.000Z', changedBy: '507f1f77bcf86cd799439001', reason: 'Đã duyệt',
    recordedAt: '2026-10-14T00:00:00.000Z' },
  latestVersion: 2,
  history: [{ key: 'SERVICE_CATALOG_VISIBLE', version: 2, enabled: true,
    effectiveAt: '2026-10-14T00:00:00.000Z', changedBy: '507f1f77bcf86cd799439001', reason: 'Đã duyệt',
    recordedAt: '2026-10-14T00:00:00.000Z' }]
};

function renderPage(apiRequest, role = 'ADMIN') {
  const adapter = { resolve: async () => ({
    status: 'authenticated', user: { id: '507f1f77bcf86cd799439001', displayName: 'Synthetic User', roles: [role] }
  }) };
  return render(<SessionProvider adapter={adapter}><AdminSystemSettingsPage apiRequest={apiRequest} /></SessionProvider>);
}

test('Admin updates catalog visibility and sees the fixed VND integer contract', async () => {
  const apiRequest = jest.fn(async (path, options = {}) => {
    if (path === '/system-settings/service-catalog' && !options.method) return { data: overview, status: 200 };
    if (path === '/system-settings/service-catalog/visibility' && options.method === 'POST') {
      return { data: { version: 3, enabled: false }, status: 201 };
    }
    throw new Error('Unexpected settings request');
  });
  renderPage(apiRequest);

  expect(await screen.findByRole('heading', { name: 'Cài đặt hệ thống' })).toBeVisible();
  expect(screen.getByText('Từ chối số lẻ; không tự làm tròn')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Danh mục dịch vụ'), { target: { value: 'false' } });
  fireEvent.change(screen.getByLabelText('Lý do thay đổi', { exact: false }), { target: { value: 'Tạm dừng nhận booking' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phiên bản cài đặt' }));

  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/system-settings/service-catalog/visibility',
    expect.objectContaining({ method: 'POST', body: expect.objectContaining({
      expectedVersion: 2, enabled: false, reason: 'Tạm dừng nhận booking', effectiveAt: expect.stringMatching(/Z$/)
    }) })));
  expect(await screen.findByText('Máy chủ đã ghi nhận cấu hình mới.')).toBeVisible();
});

test('Staff can read system history but cannot edit configuration', async () => {
  renderPage(jest.fn(async () => ({ data: overview, status: 200 })), 'STAFF');
  expect(await screen.findByText((_, element) =>
    element.tagName === 'SMALL' && element.textContent.includes('Actor ID 507f1f77bcf86cd799439001'))).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Lưu phiên bản cài đặt' })).not.toBeInTheDocument();
});
