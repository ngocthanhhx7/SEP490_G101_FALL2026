import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

const payrollData = identity => ({ contracts: [], advances: [], adjustments: [], statements: [{
  id: `private-${identity}`, reference: `private-${identity}`, employeeId: 'synthetic-employee',
  status: 'PAID', version: 2, periodStart: '2026-10-01', periodEnd: '2026-11-01', dueAt: '2026-11-02', breakdown: {}
}] });
const reply = data => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data }) });
function fetchFixture(identity) {
  return async url => {
    const data = payrollData(identity());
    if (String(url).includes('/notifications?')) return reply({items: [], unreadCount: 0});
    if (String(url).includes('/payroll/me')) return reply(data);
    if (String(url).includes('/payroll/statements')) return reply({items: data.statements, nextCursor: null});
    return reply({items: [], nextCursor: null, summary: {}});
  };
}

test('legacy Admin deep link redirects to employee payroll without requesting settlement APIs', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(fetchFixture(() => 'first'));
  try {
    render(<MemoryRouter initialEntries={['/admin/settlements']}><App sessionAdapter={{
      resolve: async () => ({ status: 'authenticated', user: { id: 'Admin', roles: ['ADMIN'] } }),
      getCsrfToken: () => 'synthetic-csrf' }} /></MemoryRouter>);
    expect(await screen.findByTitle('private-first')).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/payroll/statements', expect.objectContaining({ credentials: 'same-origin' }));
    expect(globalThis.fetch.mock.calls.every(([url]) => !/settlement-requests|admin\/settlements|me\/earnings/.test(url))).toBe(true);
    expect(screen.getByRole('link', { name: 'Quản lý lương' })).toHaveAttribute('href', '/admin/payroll');
  } finally { globalThis.fetch = original; }
});

test('Staff cannot access the protected legacy Admin deep link', async () => {
  const original = globalThis.fetch; globalThis.fetch = jest.fn();
  try {
    render(<MemoryRouter initialEntries={['/admin/settlements']}><App sessionAdapter={{
      resolve: async () => ({ status: 'authenticated', user: { id: 'staff', roles: ['STAFF'] } }) }} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    expect(globalThis.fetch.mock.calls.every(([url]) => url.startsWith('/api/v1/notifications?'))).toBe(true);
  } finally { globalThis.fetch = original; }
});

test('same-role account switch clears prior employee payroll rows after legacy redirect', async () => {
  const original = globalThis.fetch; let identity = 'first'; globalThis.fetch = jest.fn(fetchFixture(() => identity));
  const session = id => ({ status: 'authenticated', user: { id, roles: ['ADMIN'] } });
  function SwitchAccount() { const { login } = useSession(); return <button onClick={() => { identity = 'second'; login({}); }}>Switch account</button>; }
  try {
    render(<MemoryRouter initialEntries={['/admin/settlements']}><SessionProvider adapter={{
      resolve: async () => session('first'), login: async () => session('second')
    }}><SwitchAccount /><AppRoutes /></SessionProvider></MemoryRouter>);
    expect(await screen.findByTitle('private-first')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    await waitFor(() => expect(screen.queryByTitle('private-first')).not.toBeInTheDocument());
    expect(await screen.findByTitle('private-second')).toBeVisible();
    expect(globalThis.fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/v1/payroll/statements'))).toHaveLength(2);
  } finally { globalThis.fetch = original; }
});
