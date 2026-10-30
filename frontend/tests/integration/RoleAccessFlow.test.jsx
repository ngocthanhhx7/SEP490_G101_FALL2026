import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { RequireSession } from '../../src/routes/RequireSession.jsx';
import { PublicSiteLayout } from '../../src/layouts/PublicSiteLayout.jsx';
import { SignInPage } from '../../src/pages/public/SignInPage.jsx';
import { SESSION_INVALIDATED_EVENT } from '../../src/services/api-client.js';

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}
function show(roles, path, from) {
  const adapter = { resolve: async () => roles ? { status: 'authenticated', user: { id: 'synthetic', roles } } : { status: 'guest' } };
  return render(<MemoryRouter initialEntries={[{ pathname: path, state: { from } }]}>
    <SessionProvider adapter={adapter}>
      <Location /><Routes>
        <Route element={<PublicSiteLayout />}>
          <Route path="/" element={<h1>Public</h1>} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route element={<RequireSession roles={['CUSTOMER']} />}>
            <Route path="/booking/service" element={<h1>Purchase</h1>} />
          </Route>
        </Route>
        <Route element={<RequireSession roles={['ADMIN']} />}>
          <Route path="/admin/dashboard" element={<h1>Admin</h1>} />
        </Route>
        <Route element={<RequireSession roles={['STAFF']} />}>
          <Route path="/staff" element={<h1>Staff</h1>} />
          <Route path="/staff/dispatch" element={<h1>Dispatch</h1>} />
        </Route>
        <Route element={<RequireSession roles={['PET_SITTER']} />}>
          <Route path="/sitter" element={<h1>Sitter</h1>} />
        </Route>
      </Routes>
    </SessionProvider>
  </MemoryRouter>);
}

test.each([
  [['ADMIN'], 'Admin'], [['STAFF'], 'Staff'], [['PET_SITTER'], 'Sitter'],
  [['CUSTOMER', 'ADMIN'], 'Admin'], [['CUSTOMER', 'STAFF'], 'Staff'], [['CUSTOMER', 'PET_SITTER'], 'Sitter'],
])('operational session %j opening storefront returns to %s', async (roles, title) => {
  show(roles, '/');
  expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Public' })).not.toBeInTheDocument();
});

test('guest must authenticate before purchase and Customer can purchase', async () => {
  const view = show(null, '/booking/service');
  expect(await screen.findByRole('heading', { name: /Chào mừng/ })).toBeVisible();
  expect(screen.getByTestId('location')).toHaveTextContent('/sign-in');
  expect(screen.queryByRole('heading', { name: 'Purchase' })).not.toBeInTheDocument();
  view.unmount();
  show(['CUSTOMER'], '/booking/service');
  expect(await screen.findByRole('heading', { name: 'Purchase' })).toBeVisible();
});

test('login preserves an authorized Staff deep link within the public layout', async () => {
  show(['ADMIN'], '/sign-in', '/staff/dispatch');
  expect(await screen.findByRole('heading', { name: 'Dispatch' })).toBeVisible();
});

test('Customer cannot open management by direct URL', async () => {
  show(['CUSTOMER'], '/admin/dashboard');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
});

test('expired or revoked session removes the private outlet', async () => {
  show(['STAFF'], '/staff');
  expect(await screen.findByRole('heading', { name: 'Staff' })).toBeVisible();
  act(() => window.dispatchEvent(new window.Event(SESSION_INVALIDATED_EVENT)));
  expect(await screen.findByRole('heading', { name: /Chào mừng/ })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Staff' })).not.toBeInTheDocument();
});
