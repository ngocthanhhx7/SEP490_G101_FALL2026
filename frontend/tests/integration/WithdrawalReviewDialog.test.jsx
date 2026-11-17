import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WithdrawalReviewDialog } from '../../src/pages/staff/WithdrawalReviewDialog.jsx';

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

const visitId = 'a'.repeat(24);
const details = { visitId, version: 3, serviceName: 'Chăm sóc tại nhà', sitterName: 'Nhân viên mẫu',
  startAt: '2026-11-16T10:00:00Z', endAt: '2026-11-16T11:00:00Z', reasonCode: 'SICK', note: 'Cần hỗ trợ sắp xếp lại.' };
const apiOf = decide => ({ withdrawalReview: jest.fn(async () => ({ data: details })), decideWithdrawal: decide });

test('Staff must provide a reason and sees that release does not itself cancel or change fees', async () => {
  const decide = jest.fn(async () => ({ data: { visitId, decision: 'RELEASE' } })), done = jest.fn();
  render(<WithdrawalReviewDialog visitId={visitId} api={apiOf(decide)} onClose={jest.fn()} onDone={done} />);
  expect(await screen.findByText('Cần hỗ trợ sắp xếp lại.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Ghi nhận quyết định' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Lý do quyết định'), { target: { value: 'Đã liên hệ xác minh.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận quyết định' }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(decide).toHaveBeenCalledWith(visitId, { expectedVersion: 3, decision: 'RELEASE', reason: 'Đã liên hệ xác minh.' }, expect.any(String));
});

test('an uncertain response freezes the request and retry reuses its original key and decision', async () => {
  const decide = jest.fn().mockResolvedValueOnce({ pending: true }).mockResolvedValueOnce({ data: { visitId, decision: 'REJECT' } });
  render(<WithdrawalReviewDialog visitId={visitId} api={apiOf(decide)} onClose={jest.fn()} onDone={jest.fn()} />);
  await screen.findByText('Cần hỗ trợ sắp xếp lại.');
  fireEvent.change(screen.getByLabelText('Kết quả xử lý'), { target: { value: 'REJECT' } });
  fireEvent.change(screen.getByLabelText('Lý do quyết định'), { target: { value: 'Cần bàn giao trước.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận quyết định' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra lại yêu cầu' }));
  await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
  expect(decide.mock.calls[1]).toEqual(decide.mock.calls[0]);
});
