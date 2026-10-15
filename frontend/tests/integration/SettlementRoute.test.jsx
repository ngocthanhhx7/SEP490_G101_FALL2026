import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';
import { AppRoutes } from '../../src/routes/AppRoutes.jsx';

test('real sitter settlement route loads same-origin API and exposes policy blocker in navigation', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 },
    data: { requestWeekKey: '2026-10-12', balances: { accrued: 0, available: 0, reserved: 0, paid: 0 },
      earnings: [], requests: [], quotaUsed: false, decisionIds: ['FIN-07-ELIG'] } }) }));
  try {
    render(<MemoryRouter initialEntries={['/sitter/settlements']}><App sessionAdapter={{
      resolve: async () => ({ status: 'authenticated', user: { id: 'sitter', roles: ['PET_SITTER'] } }),
      getCsrfToken: () => 'synthetic-csrf' }} /></MemoryRouter>);
    expect(await screen.findByText(/Chờ quyết định/)).toHaveTextContent('FIN-07-ELIG');
    expect(screen.getByRole('link', { name: 'Tất toán tuần' })).toHaveAttribute('href', '/sitter/settlements');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/settlement-requests', expect.objectContaining({ credentials: 'same-origin' }));
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu tất toán' })).toBeDisabled();
  } finally { globalThis.fetch = original; }
});

test('Staff cannot reach sitter settlement API through protected route', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn();
  try {
    render(<MemoryRouter initialEntries={['/sitter/settlements']}><App sessionAdapter={{
      resolve: async () => ({ status: 'authenticated', user: { id: 'staff', roles: ['STAFF'] } }) }} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally { globalThis.fetch = original; }
});

test('same-role account change clears prior private rows and reloads the API', async () => {
  const original = globalThis.fetch;
  let identity = 'first';
  const response = () => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data: {
    requestWeekKey: '2026-10-12', balances: { accrued: 0, available: 0, reserved: 0, paid: 0 },
    earnings: [{ id: identity, earningPeriodKey: `private-${identity}`, availableVnd: 0 }], requests: [], decisionIds: [], quotaUsed: false
  } }) });
  globalThis.fetch = jest.fn(async () => response());
  const session = id => ({ status: 'authenticated', user: { id, roles: ['PET_SITTER'] } });
  function SwitchAccount() {
    const { login } = useSession();
    return <button onClick={() => { identity = 'second'; login({}); }}>Switch account</button>;
  }
  try {
    render(<MemoryRouter initialEntries={['/sitter/settlements']}><SessionProvider adapter={{
      resolve: async () => session('first'), login: async () => session('second')
    }}><SwitchAccount /><AppRoutes /></SessionProvider></MemoryRouter>);
    expect(await screen.findByText(/private-first/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
    await waitFor(() => expect(screen.queryByText(/private-first/)).not.toBeInTheDocument());
    expect(await screen.findByText(/private-second/)).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  } finally { globalThis.fetch = original; }
});
