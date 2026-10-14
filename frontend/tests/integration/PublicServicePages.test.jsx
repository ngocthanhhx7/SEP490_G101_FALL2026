jest.mock('../../src/pages/public/public-pages.css', () => ({}), { virtual: true });
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicSiteLayout } from '../../src/layouts/PublicSiteLayout.jsx';
import { ServiceAreasPage } from '../../src/pages/public/ServiceAreasPage.jsx';
import { ServiceDetailsPage } from '../../src/pages/public/ServiceDetailsPage.jsx';
import { ServiceListPage } from '../../src/pages/public/ServiceListPage.jsx';

const services = [
  {
    id: 'dog-walk-1', name: 'Dắt chó đi dạo', description: 'Đồng hành cùng chó ngoài trời.',
    scope: 'Theo lịch đã xác nhận.', species: ['DOG'],
    price: { amountVnd: 50000, currency: 'VND', unitLabel: 'mỗi lượt' },
    policy: { version: 1, title: 'Chính sách dắt chó', body: 'Nội dung hiện hành do catalog cung cấp.', effectiveAt: '2026-10-01T00:00:00.000Z' },
  },
  {
    id: 'cat-care-1', name: 'Ghé thăm mèo tại nhà', description: 'Chăm sóc mèo trong không gian quen thuộc.',
    scope: 'Theo thông tin chủ nuôi cung cấp.', species: ['CAT'],
    price: { amountVnd: 70000, currency: 'VND', unitLabel: 'mỗi lượt' },
    policy: { version: 3, title: 'Chính sách chăm mèo', body: 'Nội dung hiện hành dành cho mèo.', effectiveAt: '2026-10-02T00:00:00.000Z' },
  },
];
const catalog = { available: true, services };

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<PublicSiteLayout />}>
        <Route path="/services" element={<ServiceListPage loadCatalog={() => Promise.resolve({ data: catalog })} />} />
        <Route path="/services/:serviceId" element={<ServiceDetailsPage loadCatalog={() => Promise.resolve({ data: catalog })} />} />
        <Route path="/service-areas" element={<ServiceAreasPage
          loadAreas={() => Promise.resolve({ data: {
            available: true, areas: [{ id: 'test-area', name: 'Khu vực kiểm thử', description: 'Fixture tổng hợp.' }],
          } })}
          loadCatalog={() => Promise.resolve({ data: catalog })}
        />} />
      </Route>
    </Routes>
  </MemoryRouter>);
}

test('service list filters catalog results by Vietnamese search and species', async () => {
  renderAt('/services');
  expect(await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Ghé thăm mèo tại nhà' })).toBeVisible();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm dịch vụ' }), { target: { value: 'dắt chó' } });
  expect(screen.getByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Ghé thăm mèo tại nhà' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Đối tượng'), { target: { value: 'CAT' } });
  expect(screen.getByRole('heading', { name: 'Không tìm thấy dịch vụ phù hợp' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
  expect(screen.getByRole('heading', { name: 'Ghé thăm mèo tại nhà' })).toBeVisible();
});

test('service detail reads price and policy from the catalog and links to sign in', async () => {
  renderAt('/services/dog-walk-1');
  expect(await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
  expect(screen.getByText(/50\.000.*mỗi lượt/)).toBeVisible();
  expect(screen.getByText('Nội dung hiện hành do catalog cung cấp.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Đặt dịch vụ này' }))
    .toHaveAttribute('href', '/sign-in?serviceId=dog-walk-1');
});

test('service details return a not-found state for an unpublished service', async () => {
  renderAt('/services/removed-service');
  expect(await screen.findByRole('heading', { name: 'Không tìm thấy dịch vụ' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Xem danh mục dịch vụ' })).toHaveAttribute('href', '/services');
});

test('service areas page uses published areas and service policy data', async () => {
  renderAt('/service-areas');
  expect(await screen.findByRole('heading', { name: 'Khu vực kiểm thử' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Chính sách dịch vụ' })).toBeVisible();
  expect(screen.getByText('Nội dung hiện hành do catalog cung cấp.')).toBeVisible();
  expect(screen.getByText('Nội dung hiện hành dành cho mèo.')).toBeVisible();
});

test('service area page announces pending and forbidden states', async () => {
  const pending = render(<MemoryRouter initialEntries={['/service-areas']}>
    <Routes><Route path="/service-areas" element={<ServiceAreasPage
      loadAreas={() => Promise.resolve({ data: null, pending: true })}
      loadCatalog={() => Promise.resolve({ data: catalog })}
    />} /></Routes>
  </MemoryRouter>);
  expect(await screen.findByRole('status')).toHaveTextContent('đang được xác nhận');
  pending.unmount();

  render(<MemoryRouter initialEntries={['/service-areas']}>
    <Routes><Route path="/service-areas" element={<ServiceAreasPage
      loadAreas={() => Promise.reject(Object.assign(new Error('denied'), { status: 403 }))}
      loadCatalog={() => Promise.resolve({ data: catalog })}
    />} /></Routes>
  </MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn chưa thể xem thông tin này');
});