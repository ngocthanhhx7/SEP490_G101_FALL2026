import { fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const id = 'a'.repeat(24), base = '/staff/dispatch?sitterId=' + 'b'.repeat(24), target = base + '&visitId=' + id;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function Navigation() {
  const location = useLocation();
  return <><output>{location.pathname + location.search}</output><Link to={target}>Open notification</Link></>;
}

test('closing dispatch detail keeps the sitter filter and the same notification opens again', async () => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  globalThis.fetch = jest.fn(async path => ({ ok: true, status: 200, json: async () => ({
    meta: { schemaVersion: 1 }, data: String(path).endsWith('/visits/' + id + '/dispatch')
      ? { id, version: 1, serviceDisplayName: 'Visit A' } : { items: [] }
  }) }));
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'staff', roles: ['STAFF'] } }) };
  render(<MemoryRouter initialEntries={[target]}><SessionProvider adapter={adapter}><Navigation /><AppRoutes /></SessionProvider></MemoryRouter>);
  const dialog = await screen.findByRole('dialog', { name: 'Chi tiết điều phối' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
  expect(screen.getByText(base)).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Open notification' }));
  expect(within(await screen.findByRole('dialog')).getByText('Visit A')).toBeVisible();
});
