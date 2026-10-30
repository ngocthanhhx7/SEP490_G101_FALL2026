import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { CustomerRegistrationPage } from '../../src/pages/public/CustomerRegistrationPage.jsx';
import { PublicPolicyProvider } from '../../src/contexts/PublicPolicyContext.jsx';

const syntheticPolicies = ['terms', 'privacy'].map(slug => ({ slug, versionId: `test-${slug}`, status: 'APPROVED',
  effectiveAt: '2020-01-01T00:00:00Z', approvedAt: '2020-01-01T00:00:00Z' }));

function renderRegistration(api = {}) {
  const sessionAdapter = { resolve: jest.fn().mockResolvedValue({ status: 'guest' }) };
  const view = render(<MemoryRouter initialEntries={['/register']}>
    <SessionProvider adapter={sessionAdapter}><PublicPolicyProvider policies={syntheticPolicies}>
      <Routes><Route path="/register" element={<CustomerRegistrationPage api={api} />} /></Routes>
    </PublicPolicyProvider></SessionProvider>
  </MemoryRouter>);
  return { ...view, sessionAdapter };
}

function fillNameAndEmail() {
  fireEvent.change(screen.getByLabelText('Họ và tên của bạn'), { target: { value: '  Nguyễn   Văn A  ' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: '  HELLO@PawWorld.com ' } });
}
function sendAfterDetails() {
  if (!screen.getByRole('checkbox').checked) fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký', exact: true }));
}

test('renders accessible customer registration fields and OTP-only language', () => {
  renderRegistration();
  expect(screen.getByRole('heading', { name: 'Đăng ký tài khoản mới' })).toBeVisible();
  expect(screen.getByLabelText('Họ và tên của bạn')).toBeRequired();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/mật khẩu/i)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', '/policies/terms/test-terms');
  expect(screen.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute('href', '/policies/privacy/test-privacy');
});

test('validates name, contact, OTP and consent before sending or registering', () => {
  renderRegistration({ requestOtp: jest.fn(), verifyAndRegister: jest.fn() });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký', exact: true }));
  expect(screen.getByText('Vui lòng nhập họ và tên.')).toBeVisible();
  expect(screen.getByText('Nhập địa chỉ email hợp lệ.')).toBeVisible();
  expect(screen.getByText('Bạn cần xác nhận đồng ý để tiếp tục.')).toBeVisible();
});

test('shows provider delivery as pending and enforces resend cooldown', async () => {
  const api = { requestOtp: jest.fn().mockResolvedValue({ challengeId: 'challenge-1', expiresInSeconds: 300, resendAfterSeconds: 60 }) };
  renderRegistration(api);
  fillNameAndEmail();
  sendAfterDetails();
  expect(await screen.findByRole('status')).toHaveTextContent('Trạng thái gửi email/tin nhắn chưa được xác nhận');
  expect(api.requestOtp).toHaveBeenCalledWith({ channel: 'EMAIL', contact: 'hello@pawworld.com' });
  expect(screen.getByRole('button', { name: /gửi lại sau 00:59|gửi lại sau 01:00/i })).toBeDisabled();
});

test('registers with normalized contact and name only after code and consent', async () => {
  const api = {
    requestOtp: jest.fn().mockResolvedValue({ challengeId: 'challenge-2', expiresInSeconds: 300, resendAfterSeconds: 60 }),
    verifyAndRegister: jest.fn().mockResolvedValue({ authenticated: true, user: { id: 'synthetic-id', displayName: 'Nguyễn Văn A' } }),
  };
  const { sessionAdapter } = renderRegistration(api);
  fillNameAndEmail();
  sendAfterDetails();
  await screen.findByRole('status');
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '012345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & hoàn tất đăng ký' }));
  expect(await screen.findByRole('heading', { name: 'Đăng ký thành công!' })).toBeVisible();
  expect(api.verifyAndRegister).toHaveBeenCalledWith({
    challengeId: 'challenge-2', channel: 'EMAIL', contact: 'hello@pawworld.com', code: '012345', displayName: 'Nguyễn Văn A',
    policyVersions: { terms: 'test-terms', privacy: 'test-privacy' },
  });
  await waitFor(() => expect(sessionAdapter.resolve).toHaveBeenCalledTimes(2));
});

test('uses email registration and keeps an invalid OTP error visible', async () => {
  const api = {
    requestOtp: jest.fn().mockResolvedValue({ challengeId: 'challenge-3', expiresInSeconds: 300, resendAfterSeconds: 60 }),
    verifyAndRegister: jest.fn().mockRejectedValue(Object.assign(new Error('safe'), { code: 'OTP_INVALID_OR_EXPIRED' })),
  };
  renderRegistration(api);
  fireEvent.change(screen.getByLabelText('Họ và tên của bạn'), { target: { value: 'Lê Thị B' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.test' } });
  sendAfterDetails();
  await screen.findByRole('status');
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(api.requestOtp).toHaveBeenCalledWith({ channel: 'EMAIL', contact: 'person@example.test' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác thực & hoàn tất đăng ký' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Mã OTP không đúng hoặc đã hết hạn');
  expect(screen.queryByRole('heading', { name: 'Đăng ký thành công!' })).not.toBeInTheDocument();
});

test('clears a challenge when the contact changes and does not persist registration values', async () => {
  const api = { requestOtp: jest.fn().mockResolvedValue({ challengeId: 'challenge-4', expiresInSeconds: 300, resendAfterSeconds: 60 }) };
  renderRegistration(api);
  fillNameAndEmail();
  sendAfterDetails();
  await screen.findByRole('status');
  fireEvent.click(screen.getByRole('button', { name: 'Thay đổi thông tin liên hệ' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'next@pawworld.com' } });
  expect(screen.queryByText(/Hiệu lực trong/)).not.toBeInTheDocument();
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
});
