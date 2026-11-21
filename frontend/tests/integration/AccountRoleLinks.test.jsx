import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { AccountPage } from '../../src/pages/account/AccountPage.jsx';

test.each(['CUSTOMER', 'PET_SITTER', 'ADMIN', 'STAFF', 'SALE_STAFF'])(
  '%s can open their personal profile separately from contact settings and user management',
  async role => {
    const adapter = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', displayName: 'Synthetic', roles: [role] } }) };
    render(<MemoryRouter><SessionProvider adapter={adapter}><AccountPage /></SessionProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Synthetic' });
    expect(screen.getByRole('link', { name: 'Chỉnh sửa hồ sơ' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('link', { name: 'Liên hệ & bảo mật' })).toHaveAttribute('href', '/account/settings');
    expect(screen.queryByRole('link', { name: 'Quản lý tài khoản người dùng' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tài khoản của bạn')).not.toBeInTheDocument();
  }
);
