import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileAppShell } from '../../src/layouts/MobileAppShell.jsx';
import { mobileRoute } from '../../src/routes/mobile-route-metadata.js';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

function show({ enabled = true, role, path = '/' } = {}) {
  const session = { resolve: async () => role
    ? { status: 'authenticated', user: { id: 'fixture', roles: [role], displayName: 'Tài khoản thử' } }
    : { status: 'guest' } };
  return render(<MemoryRouter initialEntries={[path]}>
    <SessionProvider adapter={session}>
      <MobileAppShell route={enabled ? mobileRoute(path, role) : null}><main>Nội dung hiện tại</main></MobileAppShell>
    </SessionProvider>
  </MemoryRouter>);
}

test('keeps desktop routes free of compact tabs and hides tabs on the install guide', () => {
  const web = show({ enabled: false });
  expect(screen.queryByRole('navigation', { name: 'Điều hướng ứng dụng' })).not.toBeInTheDocument();
  web.unmount();
  show({ path: '/install' });
  expect(screen.queryByRole('navigation', { name: 'Điều hướng ứng dụng' })).not.toBeInTheDocument();
});

test('compact deep links select their matching booking or pet tab', async () => {
  const booking = show({ role: 'CUSTOMER', path: '/account/bookings/fixture/visits/visit' });
  expect(await screen.findByRole('link', { name: 'Lịch hẹn' })).toHaveAttribute('aria-current', 'page');
  booking.unmount();
  show({ role: 'CUSTOMER', path: '/account/pets/fixture' });
  expect(await screen.findByRole('link', { name: 'Thú cưng' })).toHaveAttribute('aria-current', 'page');
});

test('sitter tabs use the existing work routes and do not show customer booking', async () => {
  show({ role: 'PET_SITTER', path: '/sitter/invitations' });
  const tabs = within(screen.getByRole('navigation', { name: 'Điều hướng ứng dụng' }));
  expect(await tabs.findByRole('link', { name: 'Lời mời' })).toHaveAttribute('href', '/sitter/invitations');
  expect(tabs.getByRole('link', { name: 'Ca làm' })).toHaveAttribute('href', '/sitter/schedule');
  expect(tabs.queryByRole('link', { name: 'Lịch hẹn' })).not.toBeInTheDocument();
});
