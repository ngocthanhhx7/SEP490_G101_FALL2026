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
  test.each([
    ['Đổi email', 'Email', 'new@example.test', 'n***@example.test'],
    ['Thêm số điện thoại', 'Số điện thoại', '0912345678', '+•••••••5678'],
    ['Thêm số điện thoại', 'Số điện thoại', '+84912345678', '+•••••••5678']
  ])('shows only the masked destination in the %s OTP step (%s, %s)', async (action, label, contact, maskedContact) => {
    const { container } = renderPage({
      getContacts: async () => [oldEmail],
      requestContactOtp: async () => ({ challengeId: 'challenge', expiresInSeconds: 300, resendAfterSeconds: 60, maskedContact })
    });
    await screen.findByText(oldEmail.value);
    fireEvent.click(screen.getByRole('button', { name: action }));
    fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: contact } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));

    expect(await screen.findByText(maskedContact)).toBeVisible();
    expect(container.innerHTML).not.toContain(contact);
    expect(screen.queryByDisplayValue(contact)).not.toBeInTheDocument();
  });

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

  test('UC-04 MSG05: a contact of another account is refused under the input and never merges accounts', async () => {
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

    expect(await screen.findByText('Số điện thoại này đã được tài khoản khác sử dụng.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Số điện thoại' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Không gửi được mã' })).not.toBeInTheDocument();
    expect(api.verifyContact).not.toHaveBeenCalled();
  });

  test.each([
    ['Đổi email', 'Email', 'new@example.test', 'Email này đã được tài khoản khác sử dụng.', 'CONTACT_UNAVAILABLE'],
    ['Đổi email', 'Email', 'p@example.test', 'Đây đã là email hiện tại của bạn.', 'CONTACT_UNCHANGED'],
    ['Thêm số điện thoại', 'Số điện thoại', '+84912345678', 'Đây đã là số điện thoại hiện tại của bạn.', 'CONTACT_UNCHANGED']
  ])('UC-04 MSG04/MSG05: %s shows the message under the input and does not open the code step (%s)', async (button, field, value, message, code) => {
    const api = {
      getContacts: jest.fn(async () => [oldEmail]),
      requestContactOtp: jest.fn(async () => { throw Object.assign(new Error('refused'), { code, status: 409 }); }),
      verifyContact: jest.fn()
    };
    renderPage(api);
    await screen.findByText('p*****@example.test');
    fireEvent.click(screen.getByRole('button', { name: button }));
    fireEvent.change(screen.getByRole('textbox', { name: field }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi mã xác minh' })).toBeVisible();
  });

  test('UC-04 MSG04/MSG05 disappear as soon as the user edits the value under the input', async () => {
    const api = {
      getContacts: jest.fn(async () => [oldEmail]),
      requestContactOtp: jest.fn(async () => { throw Object.assign(new Error('refused'), { code: 'CONTACT_UNCHANGED', status: 409 }); }),
      verifyContact: jest.fn()
    };
    renderPage(api);
    await screen.findByText('p*****@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi email' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'p@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    expect(await screen.findByText('Đây đã là email hiện tại của bạn.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'p2@example.test' } });
    expect(screen.queryByText('Đây đã là email hiện tại của bạn.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).not.toHaveAttribute('aria-invalid', 'true');
    expect(api.requestContactOtp).toHaveBeenCalledTimes(1);
  });

  test('UC-04 GBR-05: a contact taken between sending the code and verifying is refused at verification', async () => {
    const api = {
      getContacts: jest.fn(async () => [oldEmail]),
      requestContactOtp: jest.fn(async () => ({ challengeId: 'challenge-3', expiresInSeconds: 300, resendAfterSeconds: 60 })),
      verifyContact: jest.fn(async () => { throw Object.assign(new Error('unavailable'), { code: 'CONTACT_UNAVAILABLE', status: 409 }); })
    };
    renderPage(api);
    await screen.findByText('p*****@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi email' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và lưu' }));

    expect(await screen.findByText(/không tự gộp tài khoản/)).toBeVisible();
  });

  test('UC-04: an account without a phone number shows "Chưa thêm" and a form titled "Thêm số điện thoại"; an account with both shows "Đổi …"', async () => {
    const api = { getContacts: jest.fn(async () => [oldEmail]), requestContactOtp: jest.fn(), verifyContact: jest.fn() };
    renderPage(api);
    await screen.findByText('p*****@example.test');
    expect(screen.getByText('Chưa thêm')).toBeVisible();
    expect(screen.queryByText('Chưa liên kết')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm số điện thoại' }));
    expect(screen.getByRole('heading', { name: 'Thêm số điện thoại' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('heading', { name: 'Thêm số điện thoại' })).not.toBeInTheDocument();
    expect(api.requestContactOtp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi email' }));
    expect(screen.getByRole('heading', { name: 'Đổi email' })).toBeVisible();
  });

  test('UC-04: an account without an email shows "Thêm email" and an account with both contacts shows "Đổi số điện thoại"', async () => {
    const phone = { ...oldEmail, id: 'contact-3', channel: 'PHONE', value: '+•••••••5678' };
    const onlyPhone = { getContacts: jest.fn(async () => [phone]), requestContactOtp: jest.fn(), verifyContact: jest.fn() };
    const { unmount } = renderPage(onlyPhone);
    await screen.findByText('+•••••••5678');
    expect(screen.getByText('Chưa thêm')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm email' }));
    expect(screen.getByRole('heading', { name: 'Thêm email' })).toBeVisible();
    unmount();
    renderPage({ getContacts: jest.fn(async () => [oldEmail, phone]), requestContactOtp: jest.fn(), verifyContact: jest.fn() });
    await screen.findByText('+•••••••5678');
    expect(screen.queryByText('Chưa thêm')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đổi số điện thoại' }));
    expect(screen.getByRole('heading', { name: 'Đổi số điện thoại' })).toBeVisible();
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
