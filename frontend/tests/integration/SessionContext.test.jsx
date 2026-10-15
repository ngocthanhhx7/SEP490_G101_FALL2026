import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';

const user = { id: 'synthetic', displayName: 'Customer', roles: ['CUSTOMER'] };
function Probe() {
  const session = useSession();
  return <><p>{session.status}</p><button onClick={() => session.login()}>Login</button>
    <button onClick={() => session.logout()}>Logout</button></>;
}

test('a slow initial session read cannot undo successful login', async () => {
  let finish;
  const adapter = { resolve: jest.fn(() => new Promise(resolve => { finish = resolve; })),
    login: async () => ({ status: 'authenticated', user }) };
  render(<SessionProvider adapter={adapter}><Probe /></SessionProvider>);
  await waitFor(() => expect(adapter.resolve).toHaveBeenCalled());
  fireEvent.click(screen.getByText('Login'));
  expect(await screen.findByText('authenticated')).toBeVisible();
  await act(async () => finish({ status: 'guest' }));
  expect(screen.getByText('authenticated')).toBeVisible();
  expect(adapter.resolve.mock.calls[0][0].signal.aborted).toBe(true);
});

test('a login completion arriving after logout cannot restore authenticated state', async () => {
  let finish;
  const adapter = { resolve: async () => ({ status: 'authenticated', user }),
    login: jest.fn(() => new Promise(resolve => { finish = resolve; })), logout: async () => {} };
  render(<SessionProvider adapter={adapter}><Probe /></SessionProvider>);
  await screen.findByText('authenticated');
  fireEvent.click(screen.getByText('Login'));
  await waitFor(() => expect(adapter.login).toHaveBeenCalled());
  fireEvent.click(screen.getByText('Logout'));
  await screen.findByText('guest');
  await act(async () => finish({ status: 'authenticated', user }));
  expect(screen.getByText('guest')).toBeVisible();
});
