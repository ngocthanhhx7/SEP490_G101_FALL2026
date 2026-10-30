import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ServiceWorkspacePage } from '../../src/pages/admin/ServiceWorkspacePage.jsx';

jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => ({ getCsrfToken: () => 'synthetic-csrf' }) }));
jest.mock('../../src/components/common/WorkspaceAnalytics.jsx', () => ({ WorkspaceAnalytics: () => <section aria-label="Phân tích tổng quan" /> }));
const services = Array.from({ length: 13 }, (_, i) => ({ id: String(i + 1), code: `care-${i}`, name: `Dịch vụ ${String(i).padStart(2, '0')}`,
  species: ['DOG'], scope: 'Chăm sóc tại nhà', description: 'Mô tả', state: i ? 'ACTIVE' : 'DRAFT', version: 2,
  effectiveAt: '2026-10-01T00:00:00Z', price: { amountVnd: 100000, unitLabel: 'buổi' } }));
beforeEach(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
function setup() {
  const request = jest.fn(async (path, options = {}) => {
    if (options.method) return { data: { version: 3 }, status: 201 };
    if (path.includes('/combo')) return { data: { latestVersion: 2, policies: [{ version: 2, comboPerVisitBps: 100, comboMaxBps: 1000, effectiveAt: services[0].effectiveAt }] } };
    if (path.startsWith('/service-prices')) return { data: { latestVersion: 4, prices: [{ version: 4, amountVnd: 100000, unitLabel: 'buổi', effectiveAt: services[0].effectiveAt }] } };
    return { data: services, status: 200 };
  });
  render(<ServiceWorkspacePage apiRequest={request} />);
  return request;
}
async function action(name) {
  fireEvent.click((await screen.findAllByRole('button', { name: /^Thao tác Dịch vụ/ }))[0]);
  fireEvent.click(screen.getByRole('menuitem', { name, exact: true }));
}
test('full service table filters and paginates without losing the create command', async () => {
  setup();
  await screen.findByText('13 dịch vụ · Trang 1 / 2');
  expect(screen.getAllByRole('row')).toHaveLength(11);
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }));
  expect(screen.getAllByRole('row')).toHaveLength(4);
  fireEvent.change(screen.getByLabelText('Tìm dịch vụ'), { target: { value: 'Dịch vụ 00' } });
  expect(screen.getByText('1 dịch vụ · Trang 1 / 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tạo dịch vụ' }));
  expect(screen.getByRole('dialog', { name: 'Tạo dịch vụ' })).toBeVisible();
  expect(screen.getByLabelText(/Mã dịch vụ/)).toBeRequired();
});
test('price and combo edits carry independent expected versions and integer backend values', async () => {
  const request = setup();
  await action('Cập nhật giá');
  const priceDialog = screen.getByRole('dialog');
  fireEvent.change(await within(priceDialog).findByLabelText(/Giá \(VND\)/), { target: { value: '150000' } });
  fireEvent.change(within(priceDialog).getByLabelText(/Lý do thay đổi/), { target: { value: 'Giá mới được duyệt' } });
  fireEvent.click(within(priceDialog).getByRole('button', { name: 'Lưu phiên bản mới' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/service-prices/admin/1', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ expectedVersion: 4, amountVnd: 150000, unitLabel: 'buổi' }) })));
  await screen.findByText('Đã lưu thay đổi');
  await action('Ưu đãi nhiều buổi');
  const comboDialog = screen.getByRole('dialog');
  fireEvent.change(await within(comboDialog).findByLabelText('Giảm mỗi lượt (%)'), { target: { value: '1.25' } });
  fireEvent.change(within(comboDialog).getByLabelText(/Lý do thay đổi/), { target: { value: 'Điều chỉnh được duyệt' } });
  fireEvent.click(within(comboDialog).getByRole('button', { name: 'Lưu phiên bản mới' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/pricing/services/1/combo', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ expectedVersion: 2, comboPerVisitBps: 125, comboMaxBps: 1000 }) })));
});
test('archive creates a historical service revision and stale writes stay visible as errors', async () => {
  const request = setup();
  await action('Lưu trữ');
  const dialog = screen.getByRole('alertdialog');
  fireEvent.change(within(dialog).getByLabelText(/Lý do thay đổi/), { target: { value: 'Ngừng cung cấp' } });
  request.mockRejectedValueOnce({ status: 409 });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận lưu trữ' }));
  expect(await within(dialog).findByText(/Dữ liệu đã thay đổi/)).toBeInTheDocument();
  expect(request).toHaveBeenLastCalledWith('/services/admin/1', expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ state: 'ARCHIVED', expectedVersion: 2 }) }));
  expect(dialog).toBeVisible();
});
