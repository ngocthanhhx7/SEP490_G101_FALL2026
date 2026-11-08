import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminServicePricesPage } from '../../src/pages/admin/AdminServicePricesPage.jsx';

const mockSession = { status: 'authenticated', user: { roles: ['ADMIN'] } };
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => mockSession }));
const services = [{ id: 'first', name: 'Dịch vụ một', code: 'ONE' }, { id: 'second', name: 'Dịch vụ hai', code: 'TWO' }];
const price = version => ({ version, amountVnd: 1000 + version, unitLabel: 'giờ', effectiveAt: '2026-01-01T00:00:00Z' });
function fixture(writeError) {
  return jest.fn(async (path, options) => {
    if (path === '/services/admin') return { data: services };
    if (options?.method === 'POST') {
      if (writeError) throw writeError;
      return { data: price(4) };
    }
    const second = path.includes('/second/'), deep = path.includes('before=');
    return { data: { prices: [price(second ? 10 : deep ? 1 : 3)], latestVersion: second ? 10 : 4,
      nextCursor: deep || second ? null : 'first~2026-01-01T00:00:00.000Z' } };
  });
}
async function next() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await screen.findByText(/Phiên bản 1 ·/);
}
test('navigates cursor stack, resets on service switch and keeps current latestVersion for writes', async () => {
  const api = fixture(); render(<AdminServicePricesPage apiRequest={api} />);
  await screen.findByText(/Phiên bản 3 ·/); await next();
  expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
  await screen.findByText(/Phiên bản 3 ·/); await next();
  fireEvent.click(screen.getByRole('button', { name: /Dịch vụ hai/ }));
  await screen.findByText(/Phiên bản 10 ·/); expect(screen.getByText('Trang 1')).toBeInTheDocument();
  expect(api.mock.calls.filter(([path]) => path.includes('/second/')).every(([path]) => !path.includes('before='))).toBe(true);
  fireEvent.change(screen.getByLabelText(/Giá \(VND\)/), { target: { value: '2000' } });
  fireEvent.change(screen.getByLabelText(/Đơn vị áp dụng/), { target: { value: 'giờ' } });
  fireEvent.change(screen.getByLabelText(/Lý do thay đổi/), { target: { value: 'Synthetic update' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu phiên bản giá' }).closest('form'));
  await screen.findByText('Máy chủ đã ghi nhận phiên bản giá mới.');
  expect(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body.expectedVersion).toBe(10);
  expect(screen.getByText('Trang 1')).toBeInTheDocument();
});
test('409 resets history and never retries POST automatically', async () => {
  const api = fixture(Object.assign(new Error('conflict'), { status: 409 }));
  render(<AdminServicePricesPage apiRequest={api} />); await next();
  fireEvent.change(screen.getByLabelText(/Giá \(VND\)/), { target: { value: '2000' } });
  fireEvent.change(screen.getByLabelText(/Đơn vị áp dụng/), { target: { value: 'giờ' } });
  fireEvent.change(screen.getByLabelText(/Lý do thay đổi/), { target: { value: 'Synthetic update' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Lưu phiên bản giá' }).closest('form'));
  await screen.findByText(/Giá vừa được thay đổi/); await screen.findByText(/Phiên bản 3 ·/);
  expect(screen.getByText('Trang 1')).toBeInTheDocument();
  expect(api.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});
test('late response for previous service cannot replace the selected service history', async () => {
  let resolveOld;
  const api = fixture(), normal = api.getMockImplementation();
  api.mockImplementation((path, options) => path.includes('/first/history')
    ? new Promise(resolve => { resolveOld = resolve; }) : normal(path, options));
  render(<AdminServicePricesPage apiRequest={api} />);
  await waitFor(() => expect(resolveOld).toBeDefined());
  expect(screen.getByRole('button', { name: 'Lưu phiên bản giá' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Dịch vụ hai/ }));
  await screen.findByText(/Phiên bản 10 ·/);
  resolveOld({ data: { prices: [price(99)], latestVersion: 99 } });
  await waitFor(() => expect(screen.queryByText(/Phiên bản 99 ·/)).not.toBeInTheDocument());
});
