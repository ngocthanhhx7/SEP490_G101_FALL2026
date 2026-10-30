import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

test('real Admin settlement route loads same-origin payroll and appears in navigation', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 },
    data: { items: [], nextCursor: null, decisionIds: ['FIN-08-EDIT'] } }) }));
  try {
    render(<MemoryRouter initialEntries={['/admin/settlements']}><App sessionAdapter={{
      resolve: async () => ({ status: 'authenticated', user: { id: 'admin', roles: ['ADMIN'] } }),
      getCsrfToken: () => 'synthetic-csrf' }} /></MemoryRouter>);
    expect(await screen.findByText(/Chờ quyết định/)).toHaveTextContent('FIN-08-EDIT');
    expect(screen.getByRole('link', { name: 'Duyệt tất toán' })).toHaveAttribute('href', '/admin/settlements');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/admin/settlements', expect.objectContaining({ credentials: 'same-origin' }));
  } finally { globalThis.fetch = original; }
});

test('Staff cannot read payroll through the protected route', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn();
  try {
    render(<MemoryRouter initialEntries={['/admin/settlements']}><App sessionAdapter={{
      resolve: async () => ({ status: 'authenticated', user: { id: 'staff', roles: ['STAFF'] } }) }} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally { globalThis.fetch = original; }
});

test('same-role account change clears prior payroll rows and command state', async () => {
  const original = globalThis.fetch;
  let identity = 'first';
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data: {
    items: [{ id: `private-${identity}`, sitterId: 'sitter', requestWeekKey: '2026-10-12', amountVnd: 10, status: 'PAID', version: 1 }],
    nextCursor: null, decisionIds: []
  } }) }));
  const session = id => ({ status: 'authenticated', user: { id, roles: ['ADMIN'] } });
  function SwitchAccount() {
    const { login } = useSession();
    return <button onClick={() => { identity = 'second'; login({}); }}>Switch account</button>;
  }
  try {
    render(<MemoryRouter initialEntries={['/admin/settlements']}><SessionProvider adapter={{
      resolve: async () => session('first'), login: async () => session('second')
    }}><SwitchAccount /><AppRoutes /></SessionProvider></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'private-first' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'private-first' })).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { name: 'private-second' })).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  } finally { globalThis.fetch = original; }
});
