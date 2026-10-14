jest.mock('../../src/pages/public/public-pages.css', () => ({}), { virtual: true });
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '../../src/pages/public/HomePage.jsx';
import { PublicSiteLayout } from '../../src/layouts/PublicSiteLayout.jsx';

const service = {
  id: 'service-123',
  code: 'pet-care',
  version: 1,
  name: 'Ghé thăm và chăm sóc thú cưng',
  description: 'Người chăm sóc ghé thăm chó hoặc mèo tại nhà.',
  scope: 'Thực hiện theo lịch và lưu ý đã xác nhận.',
  species: ['DOG', 'CAT'],
  policy: {
    version: 2,
    title: 'Chính sách dịch vụ chăm sóc',
    body: 'Nội dung do catalog công khai cung cấp.',
    effectiveAt: '2026-10-01T00:00:00.000Z',
  },
  price: { amountVnd: 50000, currency: 'VND', unitLabel: 'mỗi lượt' },
};

function catalog(services = [service], available = true) {
  return { available, services };
}

function renderHome(loadCatalog, initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route element={<PublicSiteLayout />}>
        <Route path="/" element={<HomePage loadCatalog={loadCatalog} />} />
      </Route>
    </Routes>
  </MemoryRouter>);
}

test('homepage shows the approved brand, service catalog data and valid public actions', async () => {
  const loadCatalog = jest.fn().mockResolvedValue({ data: catalog() });
  renderHome(loadCatalog);

  expect(screen.getByRole('heading', { name: /Chăm pet/ })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Paw World Care' })).toHaveAttribute('src', '/assets/logo/ngang.svg');
  expect(screen.getByRole('link', { name: 'Đặt dịch vụ ngay' })).toHaveAttribute('href', '/sign-in');
  expect(screen.getByRole('link', { name: 'Khám phá dịch vụ' })).toHaveAttribute('href', '/services');
  expect(await screen.findByRole('heading', { name: service.name })).toBeVisible();
  expect(screen.getByText(/50\.000.*mỗi lượt/)).toBeVisible();
  expect(screen.queryByText(/meal kit|giỏ hàng|voucher|chatbot/i)).not.toBeInTheDocument();
});

test('homepage exposes loading, empty and unavailable catalog states', async () => {
  renderHome(() => new Promise(() => {}));
  expect(screen.getByRole('status')).toHaveTextContent('Đang tải thông tin dịch vụ');

  const emptyView = renderHome(() => Promise.resolve({ data: catalog([], true) }));
  expect(await screen.findByRole('heading', { name: 'Chưa có dịch vụ được công bố' })).toBeVisible();
  emptyView.unmount();

  renderHome(() => Promise.resolve({ data: catalog([], false) }));
  expect(await screen.findByRole('heading', { name: 'Danh mục đang được cập nhật' })).toBeVisible();
});

test('homepage lets a visitor retry after a catalog error', async () => {
  const loadCatalog = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'NETWORK_ERROR' }))
    .mockResolvedValueOnce({ data: catalog() });
  renderHome(loadCatalog);

  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được thông tin');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByRole('heading', { name: service.name })).toBeVisible();
  expect(loadCatalog).toHaveBeenCalledTimes(2);
});