import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from '../../src/contexts/SessionContext.jsx';

const user = { id: 'synthetic', displayName: 'Customer', roles: ['CUSTOMER'] };
function Probe() {
  const session = useSession();
  return <><p>{session.status}</p><button onClick={() => session.login()}>Login</button>
    <button onClick={() => session.logout()}>Logout</button></>;
}

test('confirmed profile presentation updates do not reload routes or change identity and roles', async () => {
  const adapter = { resolve: jest.fn(async () => ({ status: 'authenticated', user })) };
  function ProfileProbe() {
    const session = useSession();
    return <><output>{JSON.stringify({ status: session.status, user: session.user })}</output>
      <button onClick={() => session.updateDisplayName({ id: user.id, displayName: 'Updated', roles: ['ADMIN'] })}>Save name</button>
      <button onClick={() => session.updateDisplayName({ id: 'another-user', displayName: 'Foreign' })}>Foreign profile</button></>;
  }
  render(<SessionProvider adapter={adapter}><ProfileProbe /></SessionProvider>);
  await screen.findByText(/Customer/);
  fireEvent.click(screen.getByText('Save name'));
  expect(screen.getByRole('status')).toHaveTextContent('Updated');
  expect(screen.getByRole('status')).toHaveTextContent('CUSTOMER');
  expect(screen.getByRole('status')).not.toHaveTextContent('ADMIN');
  fireEvent.click(screen.getByText('Foreign profile'));
  expect(screen.getByRole('status')).not.toHaveTextContent('Foreign');
  expect(adapter.resolve).toHaveBeenCalledTimes(1);
});

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
