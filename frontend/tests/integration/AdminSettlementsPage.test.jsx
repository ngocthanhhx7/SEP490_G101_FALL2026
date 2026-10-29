import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSettlementsPage from '../../src/pages/admin/AdminSettlementsPage.jsx';

const row = { id: 'r1', sitterId: 's1', requestWeekKey: '2026-10-12', amountVnd: 123000, status: 'SUBMITTED', version: 0 };
test('default adapter is pending', async () => {
  render(<AdminSettlementsPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Đang chờ tích hợp payroll');
});
test('forbidden and empty states', async () => {
  const { unmount } = render(<AdminSettlementsPage api={{ load: async () => { throw { code: 'FORBIDDEN' }; } }} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền'); unmount();
  render(<AdminSettlementsPage api={{ load: async () => ({ items: [], decisionIds: [] }) }} />);
  expect(await screen.findByText('Chưa có yêu cầu tất toán.')).toBeInTheDocument();
});
test('decision gate disables mutation', async () => {
  render(<AdminSettlementsPage api={{ load: async () => ({ items: [row], decisionIds: ['FIN-08-EDIT'] }) }} />);
  expect(await screen.findByRole('button', { name: 'Lưu quyết định' })).toBeDisabled();
});
test('uncertain command retries same key', async () => {
  const calls = [];
  const api = { load: async () => ({ items: [row], decisionIds: [] }),
    decide: async (...args) => { calls.push(args); throw { code: 'TIMEOUT' }; } };
  render(<AdminSettlementsPage api={api} />);
  fireEvent.change(await screen.findByLabelText('Lý do'), { target: { value: 'Đã xem bằng chứng' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu quyết định' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0]).toEqual(calls[1]);
});
test('approved has transfer form; paid has no mutation form', async () => {
  const { unmount } = render(<AdminSettlementsPage api={{ load: async () => ({ items: [{ ...row, status: 'APPROVED' }], decisionIds: [] }) }} />);
  expect(await screen.findByLabelText('Reference chuyển khoản')).toBeInTheDocument();
  expect(screen.getByText(/Duyệt chưa có nghĩa đã trả/)).toBeInTheDocument(); unmount();
  render(<AdminSettlementsPage api={{ load: async () => ({ items: [{ ...row, status: 'PAID' }], decisionIds: [] }) }} />);
  await screen.findByText(/PAID/);
  expect(screen.queryByRole('button', { name: 'Ghi kết quả' })).not.toBeInTheDocument();
});

test('evidence upload retries the same key and fills transfer reference after success', async () => {
  const calls = [];
  const evidence = `private-image:${'a'.repeat(64)}`;
  const api = { load: async () => ({ items: [{ ...row, status: 'APPROVED' }], decisionIds: [] }),
    uploadEvidence: async (...args) => { calls.push(args); if (calls.length === 1) throw { code: 'TIMEOUT' }; return evidence; } };
  render(<AdminSettlementsPage api={api} />);
  const file = new window.File(['synthetic'], 'transfer.png', { type: 'image/png' });
  fireEvent.change(await screen.findByLabelText('Ảnh chuyển khoản'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Tải bằng chứng' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tải bằng chứng' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Tải bằng chứng' }));
  await waitFor(() => expect(screen.getByLabelText('Mã bằng chứng riêng tư')).toHaveValue(evidence));
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
});
