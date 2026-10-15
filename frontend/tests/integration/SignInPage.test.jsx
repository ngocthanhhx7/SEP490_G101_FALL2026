import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { SignInPage } from '../../src/pages/public/SignInPage.jsx';

function renderPage(adapter) {
  return render(<MemoryRouter initialEntries={['/sign-in']}>
    <SessionProvider adapter={adapter}>
      <Routes><Route path="/sign-in" element={<SignInPage />} /><Route path="/account" element={<p>Account</p>} /></Routes>
    </SessionProvider>
  </MemoryRouter>);
}

test('requests a login OTP and verifies it before navigating to account', async () => {
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
  await waitFor(() => expect(screen.getByText('Account')).toBeVisible());
  expect(adapter.login).toHaveBeenCalledWith(expect.objectContaining({ challengeId: 'challenge-1', code: '123456', rememberDevice: true }));
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
