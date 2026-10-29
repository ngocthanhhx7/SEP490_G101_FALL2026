import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/app/App.jsx';

jest.mock('../../src/pages/account/AccountPage.jsx', () => {
  const React = jest.requireActual('react');
  const { useSession } = jest.requireActual('../../src/contexts/SessionContext.jsx');
  return {
    AccountPage: function AccountProbe() {
      const { user, login } = useSession();
      const [draft, setDraft] = React.useState('');
      return (
        <section>
          <p>Account: {user.id}</p>
          <label>
            Private draft
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button onClick={() => login()}>Switch same role</button>
        </section>
      );
    }
  };
});

test('switching directly to another account with the same role clears private outlet state', async () => {
  const account = (id) => ({
    status: 'authenticated',
    user: { id, displayName: id, roles: ['CUSTOMER'] }
  });
  const adapter = {
    resolve: async () => account('first'),
    login: async () => account('second')
  };
  render(
    <MemoryRouter initialEntries={['/account']}>
      <App sessionAdapter={adapter} />
    </MemoryRouter>
  );
  await screen.findByText('Account: first');
  fireEvent.change(screen.getByLabelText('Private draft'), {
    target: { value: 'first account private draft' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Switch same role' }));
  await screen.findByText('Account: second');
  expect(screen.getByLabelText('Private draft')).toHaveValue('');
});
