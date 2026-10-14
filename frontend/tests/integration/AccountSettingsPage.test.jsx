import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountSettingsPage } from '../../src/pages/account/AccountSettingsPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const user = { id: '507f1f77bcf86cd799439011', displayName: 'Synthetic Customer', roles: ['CUSTOMER'] };
const adapter = { resolve: async () => ({ status: 'authenticated', user }) };
const oldEmail = { id: 'contact-1', channel: 'EMAIL', value: 'p*****@example.test', state: 'VERIFIED', verifiedAt: '2026-10-14T00:00:00.000Z' };

function renderPage(api) {
  return render(<MemoryRouter initialEntries={['/account/settings']}>
    <SessionProvider adapter={adapter}><AccountSettingsPage api={api} /></SessionProvider>
  </MemoryRouter>);
}

describe('account settings page', () => {
  test('keeps account identity read-only and changes a contact only after OTP verification', async () => {
    let contacts = [oldEmail];
    const api = {
      getContacts: jest.fn(async () => contacts),
      requestContactOtp: jest.fn(async () => ({ challengeId: 'challenge-1', expiresInSeconds: 300, resendAfterSeconds: 60 })),
      verifyContact: jest.fn(async () => {
        contacts = [{ ...oldEmail, id: 'contact-2', value: 'n*****@example.test' }];
        return { verified: true };
      })
    };
    renderPage(api);

    expect(await screen.findByRole('heading', { name: 'Cài đặt tài khoản' })).toBeVisible();
    expect(await screen.findByText('p*****@example.test')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Họ và tên' })).toHaveAttribute('readonly');
    expect(screen.queryByText('person@example.test')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đổi email' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    await waitFor(() => expect(api.requestContactOtp).toHaveBeenCalledWith({ channel: 'EMAIL', contact: 'new@example.test' }));
    expect(await screen.findByText(/Liên hệ đang dùng vẫn giữ nguyên/)).toBeVisible();

    fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và lưu' }));
    await waitFor(() => expect(api.verifyContact).toHaveBeenCalledWith(expect.objectContaining({
      challengeId: 'challenge-1', channel: 'EMAIL', contact: 'new@example.test', code: '123456'
    })));
    expect(await screen.findByText('n*****@example.test')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Đã cập nhật liên hệ' })).toBeVisible();
  });

  test('cancels an OTP flow without changing the current contacts', async () => {
    const api = {
      getContacts: jest.fn(async () => [oldEmail]),
      requestContactOtp: jest.fn(async () => ({ challengeId: 'challenge-2', expiresInSeconds: 300, resendAfterSeconds: 60 })),
      verifyContact: jest.fn()
    };
    renderPage(api);
    await screen.findByText('p*****@example.test');

    fireEvent.click(screen.getByRole('button', { name: 'Thêm số điện thoại' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), { target: { value: '+84912345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(await screen.findByText('Đã hủy bước xác minh')).toBeVisible();
    expect(screen.getByText('p*****@example.test')).toBeVisible();
    expect(api.verifyContact).not.toHaveBeenCalled();
  });

  test('directs an already-linked contact to support and never merges accounts', async () => {
    const api = {
      getContacts: jest.fn(async () => [oldEmail]),
      requestContactOtp: jest.fn(async () => { throw Object.assign(new Error('unavailable'), { code: 'CONTACT_UNAVAILABLE', status: 409 }); }),
      verifyContact: jest.fn()
    };
    renderPage(api);
    await screen.findByText('p*****@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm số điện thoại' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), { target: { value: '+84912345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));

    expect(await screen.findByText(/không tự gộp tài khoản/)).toBeVisible();
    expect(api.verifyContact).not.toHaveBeenCalled();
  });

  test('shows an owner-safe forbidden state if the contact projection is denied', async () => {
    const api = {
      getContacts: jest.fn(async () => { throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN', status: 403 }); }),
      requestContactOtp: jest.fn(), verifyContact: jest.fn()
    };
    renderPage(api);

    expect(await screen.findByRole('heading', { name: 'Không tải được liên hệ' })).toBeVisible();
    expect(screen.queryByText('person@example.test')).not.toBeInTheDocument();
  });
});
