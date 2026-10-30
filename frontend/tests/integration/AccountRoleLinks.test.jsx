import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AccountPage } from '../../src/pages/account/AccountPage.jsx';

test.each([
  [['CUSTOMER'], true, false],
  [['CUSTOMER', 'ADMIN'], false, true],
  [['CUSTOMER', 'STAFF'], false, false],
  [['CUSTOMER', 'PET_SITTER'], false, false],
])('account links follow effective permission for %j', async (roles, customer, admin) => {
  const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', displayName: 'Synthetic', roles } }) };
  render(<MemoryRouter><SessionProvider adapter={adapter}><AccountPage /></SessionProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Synthetic' });
  expect(!!screen.queryByRole('link', { name: 'Quản lý hồ sơ' })).toBe(customer);
  expect(!!screen.queryByRole('link', { name: 'Quản lý tài khoản người dùng' })).toBe(admin);
});
