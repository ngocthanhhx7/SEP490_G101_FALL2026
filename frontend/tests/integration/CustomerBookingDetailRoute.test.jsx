import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';
const originalFetch = globalThis.fetch, id = 'a'.repeat(24);
afterEach(() => { globalThis.fetch = originalFetch; });
function show(role) {
  globalThis.fetch = jest.fn(async path => {
    if (path !== `/api/v1/checkout/bookings/${id}`) throw new Error('synthetic unavailable');
    return { ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data: { id, state: 'DISPATCH_PENDING', totalVnd: 120000,
      visits: [{ id: 'visit', serviceName: 'Chăm sóc Milo', petNames: ['Milo'], startAt: '2026-11-12T02:00:00Z', location: 'HOME' }], careShifts: [], scheduleProposals: [] } }) };
  });
  render(<MemoryRouter initialEntries={[`/account/bookings/${id}`]}><SessionProvider adapter={{ resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', roles: [role] } }) }}><AppRoutes /></SessionProvider></MemoryRouter>);
}
test('dedicated account detail URL displays the saved order and link back to history', async () => {
  show('CUSTOMER');
  expect(await screen.findByRole('heading', { name: 'Chăm sóc Milo' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Chi tiết đơn chăm sóc' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Đơn chăm sóc', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Danh sách đơn chăm sóc' })).toHaveAttribute('href', '/account/bookings');
  expect(globalThis.fetch).toHaveBeenCalledWith(`/api/v1/checkout/bookings/${id}`, expect.objectContaining({ credentials: 'same-origin' }));
});
test('non-Customer cannot fetch an account order detail by direct URL', async () => {
  show('STAFF');
  expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
