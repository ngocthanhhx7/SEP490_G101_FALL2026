import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApplicationStatusPage } from '../../src/pages/public/application-status/ApplicationStatusPage.jsx';
import { createApplicationStatusApi } from '../../src/services/application-status-api.js';

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

test.each([false, true])('verified rejection offers reapplication only when server permits: %s', async canReapply => {
  renderPage({ requestVerification: async () => ({ challengeId: 'synthetic-challenge', resendAfterSeconds: 0 }),
    verifyAndReadStatus: async () => ({ state: 'REJECTED', submittedAt: '2026-09-01',
      rejectionReason: 'Cần bổ sung thông tin.', reapplyEligibleAt: '2026-10-01', canReapply }) });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '012345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh và xem trạng thái' }));
  await screen.findByText('Từ chối');
  const link = screen.queryByRole('link', { name: 'Nộp lại hồ sơ ứng tuyển →' });
  if (canReapply) expect(link).toHaveAttribute('href', '/register?role=sitter');
  else expect(link).not.toBeInTheDocument();
});

test('shows MSG09 on too many wrong codes, MSG10 on hourly limit and preserves 429 fields in API client', async () => {
  const api = {
    requestVerification: jest.fn()
      .mockResolvedValueOnce({ challengeId: 'challenge-lock', resendAfterSeconds: 0 })
      .mockRejectedValueOnce({ status: 429, code: 'RATE_LIMITED', reason: 'HOURLY_LIMIT', retryAfterAt: '2026-11-24T04:45:00.000Z' }),
    verifyAndReadStatus: jest.fn()
      .mockRejectedValueOnce({ status: 429, code: 'RATE_LIMITED', reason: 'TOO_MANY_WRONG_CODES', retryAfterAt: '2026-11-24T03:20:00.000Z' })
      .mockRejectedValueOnce({ status: 429, code: 'RATE_LIMITED' })
  };
  renderPage(api);
  fireEvent.change(screen.getByRole('textbox', { name: 'Mã hồ sơ' }), { target: { value: 'opaque-application-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP gồm 6 chữ số' }), { target: { value: '999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh và xem trạng thái' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 10:20.');

  fireEvent.click(screen.getByRole('button', { name: 'Xác minh và xem trạng thái' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã yêu cầu quá nhiều mã. Hãy chờ theo thời gian máy chủ thông báo rồi thử lại.');

  fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã xác minh' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau 11:45.');

  const client = createApplicationStatusApi({
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '900' }),
      json: async () => ({
        error: { code: 'RATE_LIMITED', reason: 'TOO_MANY_WRONG_CODES', retryAfterSeconds: 900, retryAfterAt: '2026-11-24T03:20:00.000Z' },
        meta: { schemaVersion: 1 }
      })
    })
  });
  await expect(client.verifyAndReadStatus({ applicationCode: 'code', challengeId: 'id', code: '999999' }))
    .rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', reason: 'TOO_MANY_WRONG_CODES', retryAfterSeconds: 900, retryAfterAt: '2026-11-24T03:20:00.000Z' });
});
