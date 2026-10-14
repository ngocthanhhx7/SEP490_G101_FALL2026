import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApplicationStatusPage } from '../../src/pages/public/application-status/ApplicationStatusPage.jsx';

function renderPage(api, initialEntry = '/application-status') {
  return render(<MemoryRouter initialEntries={[initialEntry]}>
    <ApplicationStatusPage api={api} />
  </MemoryRouter>);
}

test('collects only an application code and requests a challenge without putting it in the URL', async () => {
  const api = { requestVerification: jest.fn().mockResolvedValue({
    challengeId: 'challenge-1', expiresInSeconds: 300, resendAfterSeconds: 0
  }) };
  renderPage(api);
  expect(screen.getByRole('heading', { name: 'Theo dõi hồ sơ ứng tuyển' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Không nhập số giấy tờ hoặc thông tin cá nhân khác');
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  expect(await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' })).toBeVisible();
  expect(api.requestVerification).toHaveBeenCalledWith({ applicationCode: 'opaque-application-code' });
  expect(window.location.pathname).toBe('/');
  expect(screen.getByRole('status')).toHaveTextContent('Nếu mã hồ sơ hợp lệ');
  expect(screen.queryByLabelText(/số giấy tờ|cccd|email|số điện thoại/i)).not.toBeInTheDocument();
});

test('shows a verified rejection reason and the Vietnam-local reapplication date', async () => {
  const api = {
    requestVerification: jest.fn().mockResolvedValue({ challengeId: 'challenge-2', resendAfterSeconds: 60 }),
    verifyAndReadStatus: jest.fn().mockResolvedValue({ data: {
      state: 'REJECTED', submittedAt: '2026-09-29T12:00:00.000Z',
      rejectionReason: 'Please add care experience.', reapplyEligibleAt: '2026-10-31T12:00:00.000Z', canReapply: false
    } })
  };
  renderPage(api);
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '012345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh và xem trạng thái' }));
  expect(await screen.findByRole('heading', { name: 'Trạng thái hồ sơ' })).toBeVisible();
  expect(screen.getByText('Từ chối')).toBeVisible();
  expect(screen.getByText('Please add care experience.')).toBeVisible();
  expect(screen.getByText('31 tháng 10, 2026')).toBeVisible();
  expect(api.verifyAndReadStatus).toHaveBeenCalledWith({
    applicationCode: 'opaque-application-code', challengeId: 'challenge-2', code: '012345'
  });
  expect(window.location.pathname).toBe('/');
});

test('keeps verification failures generic and does not display a status', async () => {
  const api = {
    requestVerification: jest.fn().mockResolvedValue({ challengeId: 'challenge-3', resendAfterSeconds: 0 }),
    verifyAndReadStatus: jest.fn().mockRejectedValue(Object.assign(new Error('sensitive detail'), {
      status: 403, code: 'FORBIDDEN'
    }))
  };
  renderPage(api);
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh và xem trạng thái' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xác minh hồ sơ với thông tin đã nhập.');
  expect(screen.queryByRole('heading', { name: 'Trạng thái hồ sơ' })).not.toBeInTheDocument();
  expect(screen.queryByText('sensitive detail')).not.toBeInTheDocument();
});

test('enforces the server resend delay in the interface', async () => {
  const api = { requestVerification: jest.fn().mockResolvedValue({
    challengeId: 'challenge-4', expiresInSeconds: 300, resendAfterSeconds: 60
  }) };
  renderPage(api);
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  const resend = await screen.findByRole('button', { name: /Gửi lại mã sau 60 giây/ });
  expect(resend).toBeDisabled();
  expect(api.requestVerification).toHaveBeenCalledTimes(1);
});

test('does not create a session or redirect when the application is approved', async () => {
  const api = {
    requestVerification: jest.fn().mockResolvedValue({ challengeId: 'challenge-5', resendAfterSeconds: 0 }),
    verifyAndReadStatus: jest.fn().mockResolvedValue({ state: 'APPROVED', submittedAt: '2026-09-29T12:00:00.000Z' })
  };
  renderPage(api, '/application-status');
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '012345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh và xem trạng thái' }));
  expect(await screen.findByText('Đã duyệt')).toBeVisible();
  expect(window.location.pathname).toBe('/');
  expect(api.verifyAndReadStatus).not.toHaveReturnedWith(expect.objectContaining({ session: expect.anything() }));
});
