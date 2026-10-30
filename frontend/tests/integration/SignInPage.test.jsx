import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { SignInPage } from '../../src/pages/public/SignInPage.jsx';

function renderPage(adapter) {
  return render(<MemoryRouter initialEntries={['/sign-in']}>
    <SessionProvider adapter={adapter}>
      <Routes><Route path="/sign-in" element={<SignInPage />} /><Route path="/register" element={<p>Registration</p>} /><Route path="/account" element={<p>Account</p>} /><Route path="/" element={<p>Home</p>} /></Routes>
    </SessionProvider>
  </MemoryRouter>);
}

test('requests a login OTP and verifies it before navigating the customer home', async () => {
  const adapter = {
    resolve: jest.fn(async () => ({ status: 'guest' })),
    requestLoginOtp: jest.fn(async () => ({ challengeId: 'challenge-1', resendAfterSeconds: 60 })),
    login: jest.fn(async () => ({ status: 'authenticated', user: { id: '1', displayName: 'Customer', roles: ['CUSTOMER'] } }))
  };
  renderPage(adapter);
  await waitFor(() => expect(adapter.resolve).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  expect(await screen.findByText(/Yêu cầu gửi mã tới/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Mã OTP 6 chữ số'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Không hỏi lại trên thiết bị này trong 30 ngày' }));
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }));
  await waitFor(() => expect(screen.getByText('Home')).toBeVisible());
  expect(adapter.login).toHaveBeenCalledWith(expect.objectContaining({ challengeId: 'challenge-1', code: '123456', rememberDevice: true }));
});

test('SMS normalizes Vietnamese numbers and verifies the same PHONE contact', async () => {
  const adapter = {
    resolve: async () => ({ status: 'guest' }),
    requestLoginOtp: jest.fn(async () => ({ challengeId: 'phone-challenge', resendAfterSeconds: 60 })),
    login: jest.fn(async () => ({ status: 'authenticated', user: { id: '1', displayName: 'Sitter', roles: ['PET_SITTER'] } }))
  };
  renderPage(adapter);
  fireEvent.click(screen.getByRole('radio', { name: 'SMS' }));
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0912 345 678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  expect(await screen.findByRole('status')).toHaveTextContent('tin nhắn SMS');
  expect(adapter.requestLoginOtp).toHaveBeenCalledWith({ channel: 'PHONE', contact: '+84912345678' });
  expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Mã OTP 6 chữ số'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }));
  expect(await screen.findByText('Account')).toBeVisible();
  expect(adapter.login).toHaveBeenCalledWith({ challengeId: 'phone-challenge', channel: 'PHONE', contact: '+84912345678', code: '123456', rememberDevice: false });
});

test('switching channels clears the old contact and registration link opens registration', async () => {
  renderPage({ resolve: async () => ({ status: 'guest' }) });
  fireEvent.change(screen.getByLabelText('Email', { selector: 'input:not([type=radio])' }), { target: { value: 'person@example.test' } });
  fireEvent.click(screen.getByRole('radio', { name: 'SMS' }));
  expect(screen.getByLabelText('Số điện thoại')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập số điện thoại hợp lệ.');
  fireEvent.click(screen.getByRole('link', { name: 'Đăng ký' }));
  expect(await screen.findByText('Registration')).toBeVisible();
});

test('wrong or expired OTP can be retried and resend replaces the challenge', async () => {
  const adapter = {
    resolve: async () => ({ status: 'guest' }),
    requestLoginOtp: jest.fn().mockResolvedValueOnce({ challengeId: 'old', resendAfterSeconds: 0 })
      .mockResolvedValueOnce({ challengeId: 'new', resendAfterSeconds: 60 }),
    login: jest.fn().mockRejectedValueOnce({ code: 'OTP_INVALID_OR_EXPIRED' })
      .mockResolvedValueOnce({ status: 'authenticated', user: { id: '1', displayName: 'Customer', roles: ['CUSTOMER'] } })
  };
  renderPage(adapter);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  const otp = await screen.findByLabelText('Mã OTP 6 chữ số');
  fireEvent.change(otp, { target: { value: '111111' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Mã OTP không đúng hoặc đã hết hạn.');
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
  await waitFor(() => expect(otp).toHaveValue(''));
  fireEvent.change(otp, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & đăng nhập' }));
  expect(await screen.findByText('Home')).toBeVisible();
  expect(adapter.login).toHaveBeenLastCalledWith(expect.objectContaining({ challengeId: 'new', code: '123456' }));
});

test('provider failure preserves the phone and allows switching to email', async () => {
  renderPage({ resolve: async () => ({ status: 'guest' }), requestLoginOtp: async () => { throw { code: 'SMS_UNAVAILABLE' }; } });
  fireEvent.click(screen.getByRole('radio', { name: 'SMS' }));
  const phone = screen.getByLabelText('Số điện thoại');
  fireEvent.change(phone, { target: { value: '+84912345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('SMS hiện không khả dụng');
  expect(phone).toHaveValue('+84912345678');
  fireEvent.click(screen.getByRole('radio', { name: 'Email' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('shows validation and provider errors without attempting login', async () => {
  const adapter = {
    resolve: jest.fn(async () => ({ status: 'guest' })),
    requestLoginOtp: jest.fn(async () => { const error = new Error(); error.code = 'OTP_RATE_LIMITED'; throw error; }),
  };
  renderPage(adapter);
  await waitFor(() => expect(adapter.resolve).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập email hợp lệ.');
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã yêu cầu quá nhiều mã');
  expect(adapter.requestLoginOtp).toHaveBeenCalledTimes(1);
});


test.each([['CUSTOMER', 'Home'], ['ADMIN', 'Account']])('an existing %s session uses the correct landing page', async (role, expected) => {
  renderPage({ resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic', displayName: 'Synthetic', roles: [role] } }) });
  expect(await screen.findByText(expected)).toBeVisible();
});
