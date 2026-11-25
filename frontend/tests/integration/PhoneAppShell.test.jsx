import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileAppShell } from '../../src/layouts/MobileAppShell.jsx';
import { mobileRoute } from '../../src/routes/mobile-route-metadata.js';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

function show({ enabled = true, role, path = '/', search = '', state } = {}) {
  const session = { resolve: async () => role
    ? { status: 'authenticated', user: { id: 'fixture', roles: [role], displayName: 'Tài khoản thử' } }
    : { status: 'guest' } };
  return render(<MemoryRouter initialEntries={[{ pathname: path, search, state }]}>
    <SessionProvider adapter={session}>
      <MobileAppShell route={enabled ? mobileRoute(path, role) : null} lookupRoute={mobileRoute}><main>Nội dung hiện tại</main></MobileAppShell>
    </SessionProvider>
  </MemoryRouter>);
}

test('keeps desktop routes free of compact tabs and hides tabs on the install guide', async () => {
  const web = show({ enabled: false });
  expect(screen.queryByRole('navigation', { name: 'Điều hướng ứng dụng' })).not.toBeInTheDocument();
  web.unmount();
  await act(async () => { show({ path: '/install' }); });
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

test('a product deep link and a notification resolve Back separately from the selected tab', async () => {
  const order = show({ role: 'CUSTOMER', path: '/customer/product-orders', search: '?page=3&order=aaaaaaaaaaaaaaaaaaaaaaaa' });
  expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/customer/product-orders?page=3');
  order.unmount();
  show({ role: 'CUSTOMER', path: '/account/notifications', state: { mobileTab: 'services', mobileBack: '/account/bookings?group=history' } });
  expect(await screen.findByRole('link', { name: 'Dịch vụ' })).toHaveAttribute('aria-current', 'page');
  await waitFor(() => expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/account/bookings?group=history'));
});

test('changing compact layout preserves the open form', async () => {
  const session = { resolve: async () => ({ status: 'guest' }) };
  const shell = route => <MemoryRouter><SessionProvider adapter={session}>
    <MobileAppShell route={route}><main><input aria-label="Tên đang nhập" defaultValue="" /></main></MobileAppShell>
  </SessionProvider></MemoryRouter>;
  const view = render(shell(mobileRoute('/register', 'GUEST')));
  await act(async () => {});
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nội dung đang nhập' } });
  view.rerender(shell(null));
  expect(screen.getByRole('textbox')).toHaveValue('Nội dung đang nhập');
});

test('Back from an application status deep link does not send a guest into the account guard', async () => {
  await act(async () => { show({ path: '/sitter/application-status' }); });
  expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/');
});

test('a product list never uses itself as the Back destination', async () => {
  await act(async () => {
    show({ role: 'CUSTOMER', path: '/customer/product-orders/', search: '?page=3',
      state: { mobileBack: '/customer/product-orders?page=3' } });
  });
  expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/account');
});

test('booking Back opens the selected service, with the catalog as fallback for an invalid ID', async () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const booking = show({ role: 'CUSTOMER', path: '/booking/' + id });
  await waitFor(() => expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/services/' + id));
  booking.unmount();
  await act(async () => { show({ role: 'CUSTOMER', path: '/booking/invalid' }); });
  expect(screen.getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/services');
});
