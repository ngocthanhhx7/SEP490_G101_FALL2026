
import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EmployeeInvitationsPage } from '../../src/pages/sitter/EmployeeInvitationsPage.jsx';
import { EmployeeDispatchPage } from '../../src/pages/staff/EmployeeDispatchPage.jsx';

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

const startAt = '2026-11-03T02:00:00Z';
const assignments = { data: { items: [{ id: 'visit', state: 'ASSIGNED', canWithdraw: true, version: 2, serviceName: 'Chăm sóc tại gia',
  startAt, endAt: '2026-11-03T03:00:00Z' }] } };
const reasons = ['ILLNESS', 'FAMILY_EMERGENCY', 'SCHEDULE_CONFLICT', 'OTHER'];
function fixture(mode = 'EARLY') {
  return {
    offers: jest.fn().mockResolvedValue({ data: { items: [] } }),
    assignments: jest.fn().mockResolvedValue(assignments),
    withdrawalOptions: jest.fn().mockResolvedValue({ data: { visitId: 'visit', mode, version: 2, startAt, reasonCodes: reasons,
      serverNow: mode === 'EARLY' ? '2026-11-02T06:00:00Z' : '2026-11-02T18:00:00Z' } }),
    withdraw: jest.fn().mockResolvedValue({ data: { visitId: 'visit', mode, startAt, version: 3 } })
  };
}

async function openWithdrawal() {
  fireEvent.click(await screen.findByRole('button', { name: 'Rút khỏi buổi' }));
  return within(await screen.findByRole('dialog'));
}

test('UC-82 requires a reason and Quay lại closes without writing', async () => {
  const api = fixture();
  render(<EmployeeInvitationsPage api={api} />);
  const modal = await openWithdrawal();
  const submit = await modal.findByRole('button', { name: 'Rút khỏi buổi' });
  expect(submit).toBeDisabled();
  fireEvent.click(modal.getByRole('button', { name: 'Quay lại' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.withdraw).not.toHaveBeenCalled();
});

test.each([
  ['EARLY', 'Rút khỏi buổi', 'Bạn đã rút khỏi buổi ngày 03/11/2026 lúc 09:00.'],
  ['LATE', 'Gửi cho nhân viên', 'Buổi này bắt đầu sau chưa đầy 12 giờ. Yêu cầu của bạn đã được gửi cho nhân viên.']
])('UC-82 MSG56 MSG57 displays the server outcome for %s and submits once', async (mode, label, message) => {
  const api = fixture(mode);
  render(<EmployeeInvitationsPage api={api} />);
  const modal = await openWithdrawal();
  fireEvent.change(await modal.findByLabelText(/Lý do/), { target: { value: 'ILLNESS' } });
  const submit = modal.getByRole('button', { name: label });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(api.withdraw).toHaveBeenCalledTimes(1);
  expect(api.withdraw).toHaveBeenCalledWith('visit', { expectedVersion: 2, expectedMode: mode, reasonCode: 'ILLNESS' }, expect.any(String));
});

test('UC-82 shows the late withdrawal and reason in the Staff queue', async () => {
  const api = { queue: jest.fn().mockResolvedValue({ data: { items: [], withdrawalRequests: [
    { id: 'visit', serviceName: 'Chăm sóc tại gia', startAt, sitterName: 'Người chăm sóc thử', reasonCode: 'ILLNESS', note: 'Ghi chú thử' }
  ] } }) };
  render(<EmployeeDispatchPage api={api} />);
  const table = within(await screen.findByRole('table', { name: 'Yêu cầu rút buổi' }));
  expect(table.getByText('Người chăm sóc thử')).toBeInTheDocument();
  expect(table.getByText('Ốm, không đi được')).toBeInTheDocument();
  expect(table.getByText('Ghi chú thử')).toBeInTheDocument();
});

test('UC-82 keeps the selected reason and requires confirmation again when the server changes mode', async () => {
  const api = fixture('LATE');
  api.withdrawalOptions.mockResolvedValueOnce(await fixture('EARLY').withdrawalOptions());
  api.withdraw.mockRejectedValueOnce({ status: 409, code: 'WITHDRAWAL_MODE_CHANGED' });
  render(<EmployeeInvitationsPage api={api} />);
  const modal = await openWithdrawal();
  fireEvent.change(await modal.findByLabelText(/Lý do/), { target: { value: 'ILLNESS' } });
  fireEvent.change(modal.getByLabelText('Ghi chú thêm'), { target: { value: 'Cần người thay' } });
  fireEvent.click(modal.getByRole('button', { name: 'Rút khỏi buổi' }));
  const confirm = await modal.findByRole('button', { name: 'Gửi cho nhân viên' });
  expect(modal.getByLabelText(/Lý do/)).toHaveValue('ILLNESS');
  expect(modal.getByLabelText('Ghi chú thêm')).toHaveValue('Cần người thay');
  expect(api.withdraw).toHaveBeenCalledTimes(1);
  fireEvent.click(confirm);
  expect(await screen.findByText('Buổi này bắt đầu sau chưa đầy 12 giờ. Yêu cầu của bạn đã được gửi cho nhân viên.')).toBeInTheDocument();
  expect(api.withdraw.mock.calls[0][2]).not.toBe(api.withdraw.mock.calls[1][2]);
});
