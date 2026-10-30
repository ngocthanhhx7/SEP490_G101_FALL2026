import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
const guestSession = { resolve: async () => ({ status: 'guest' }) };
jest.mock('../../src/styles/public-pages.css', () => ({}), { virtual: true });
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicSiteLayout } from '../../src/layouts/PublicSiteLayout.jsx';
import { ServiceAreasPage } from '../../src/pages/public/ServiceAreasPage.jsx';
import { ServiceDetailsPage } from '../../src/pages/public/ServiceDetailsPage.jsx';
import { ServiceListPage } from '../../src/pages/public/ServiceListPage.jsx';

const services = [
  {
    id: 'dog-walk-1',
    name: 'Dắt chó đi dạo',
    description: 'Đồng hành cùng chó ngoài trời.',
    scope: 'Theo lịch đã xác nhận.',
    species: ['DOG'],
    price: { amountVnd: 50000, currency: 'VND', unitLabel: 'mỗi lượt' },
    policy: {
      version: 1,
      title: 'Chính sách dắt chó',
      body: 'Nội dung hiện hành do catalog cung cấp.',
      effectiveAt: '2026-10-01T00:00:00.000Z'
    },
    details: {
      preparation: ['Chuẩn bị dây dắt phù hợp.'],
      exclusions: ['Không bao gồm huấn luyện.'],
      faq: [
        { question: 'Cần chuẩn bị gì?', answer: 'Cung cấp lời dặn của bé.' }
      ]
    }
  },
  {
    id: 'cat-care-1',
    name: 'Ghé thăm mèo tại nhà',
    description: 'Chăm sóc mèo trong không gian quen thuộc.',
    scope: 'Theo thông tin chủ nuôi cung cấp.',
    species: ['CAT'],
    price: { amountVnd: 70000, currency: 'VND', unitLabel: 'mỗi lượt' },
    policy: {
      version: 3,
      title: 'Chính sách chăm mèo',
      body: 'Nội dung hiện hành dành cho mèo.',
      effectiveAt: '2026-10-02T00:00:00.000Z'
    }
  }
];
const catalog = { available: true, services };

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <SessionProvider adapter={guestSession}>
              <PublicSiteLayout />
            </SessionProvider>
          }
        >
          <Route
            path="/services"
            element={
              <ServiceListPage
                loadCatalog={() => Promise.resolve({ data: catalog })}
              />
            }
          />
          <Route
            path="/services/:serviceId"
            element={
              <ServiceDetailsPage
                loadCatalog={() => Promise.resolve({ data: catalog })}
              />
            }
          />
          <Route
            path="/service-areas"
            element={
              <ServiceAreasPage
                loadAreas={() =>
                  Promise.resolve({
                    data: {
                      available: true,
                      areas: [
                        {
                          id: 'test-area',
                          name: 'Khu vực kiểm thử',
                          description: 'Fixture tổng hợp.'
                        }
                      ]
                    }
                  })
                }
                loadCatalog={() => Promise.resolve({ data: catalog })}
              />
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

test('service list filters catalog results by Vietnamese search and species', async () => {
  renderAt('/services');
  expect(
    await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })
  ).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Ghé thăm mèo tại nhà' })
  ).toBeVisible();
  expect(
    screen.getByRole('img', { name: 'Người chăm sóc dắt chó đi dạo' })
  ).toHaveAttribute('src', '/assets/figma-public/home-Image658.webp');
  expect(
    screen.getAllByRole('link', { name: 'Đặt dịch vụ' })[0]
  ).toHaveAttribute('href', '/booking/dog-walk-1');
  expect(screen.getByText(/50\.000.*mỗi lượt/)).toBeVisible();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm dịch vụ' }), {
    target: { value: 'dắt chó' }
  });
  expect(screen.getByRole('heading', { name: 'Dắt chó đi dạo' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Ghé thăm mèo tại nhà' })
  ).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Đối tượng'), {
    target: { value: 'CAT' }
  });
  expect(
    screen.getByRole('heading', { name: 'Không tìm thấy dịch vụ phù hợp' })
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
  expect(
    screen.getByRole('heading', { name: 'Ghé thăm mèo tại nhà' })
  ).toBeVisible();
});

test('catalog query links filter published results without inventing extra services', async () => {
  renderAt('/services?q=meo');
  expect(
    await screen.findByRole('heading', { name: 'Ghé thăm mèo tại nhà' })
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Dắt chó đi dạo' })
  ).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Tìm dịch vụ' })).toHaveValue(
    'meo'
  );
  expect(
    screen.getByRole('link', { name: 'Liên hệ PawWorld' })
  ).toHaveAttribute('href', '/contact');
});

test('service detail reads price and policy from the catalog and links to sign in', async () => {
  renderAt('/services/dog-walk-1');
  expect(
    await screen.findByRole('heading', { name: 'Dắt chó đi dạo' })
  ).toBeVisible();
  expect(screen.getAllByText(/50\.000.*mỗi lượt/)).toHaveLength(2);
  expect(
    screen.getByText('Nội dung hiện hành do catalog cung cấp.')
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Đặt dịch vụ này' })).toHaveAttribute(
    'href',
    '/booking/dog-walk-1'
  );
  expect(
    screen.getByRole('heading', { name: 'Giá dịch vụ hiện hành' })
  ).toBeVisible();
  expect(screen.getByText('Không bao gồm huấn luyện.')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Chủ nuôi cần chuẩn bị' })
  );
  expect(screen.getByText('Chuẩn bị dây dắt phù hợp.')).toBeVisible();
  expect(screen.getByText('Cần chuẩn bị gì?')).toBeVisible();
});

test('service details return a not-found state for an unpublished service', async () => {
  renderAt('/services/removed-service');
  expect(
    await screen.findByRole('heading', { name: 'Không tìm thấy dịch vụ' })
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Xem danh mục dịch vụ' })
  ).toHaveAttribute('href', '/services');
});

test('service areas page uses published areas and service policy data', async () => {
  renderAt('/service-areas');
  expect(
    await screen.findByRole('heading', { name: 'Khu vực kiểm thử' })
  ).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Chính sách dịch vụ' })
  ).toBeVisible();
  expect(
    screen.getByText('Nội dung hiện hành do catalog cung cấp.')
  ).toBeVisible();
  expect(screen.getByText('Nội dung hiện hành dành cho mèo.')).toBeVisible();
});

test('service area page announces pending and forbidden states', async () => {
  const pending = render(
    <MemoryRouter initialEntries={['/service-areas']}>
      <Routes>
        <Route
          path="/service-areas"
          element={
            <ServiceAreasPage
              loadAreas={() => Promise.resolve({ data: null, pending: true })}
              loadCatalog={() => Promise.resolve({ data: catalog })}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'đang được xác nhận'
  );
  pending.unmount();

  render(
    <MemoryRouter initialEntries={['/service-areas']}>
      <Routes>
        <Route
          path="/service-areas"
          element={
            <ServiceAreasPage
              loadAreas={() =>
                Promise.reject(
                  Object.assign(new Error('denied'), { status: 403 })
                )
              }
              loadCatalog={() => Promise.resolve({ data: catalog })}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Bạn chưa thể xem thông tin này'
  );
});
