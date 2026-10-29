import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EmployeePayrollPage } from '../../src/pages/sitter/EmployeePayrollPage.jsx';
import { EmployeePayrollAdminPage } from '../../src/pages/admin/EmployeePayrollAdminPage.jsx';
import { createEmployeePayrollApi } from '../../src/services/employee-payroll-api.js';

afterEach(cleanup);
const employeeId = 'a'.repeat(24);
const contract = { id: 'contract', employmentType: 'PART_TIME', monthlyBaseVnd: 3000000, weeklyMinutes: 1200,
  payCycle: 'WEEKLY', salaryBasis: 'GROSS', effectiveAt: '2020-01-01', version: 1 };
const apiFixture = () => ({ own: jest.fn().mockResolvedValue({ contracts: [contract], advances: [], statements: [] }),
  submit: jest.fn().mockResolvedValue({}), advanceDecision: jest.fn().mockResolvedValue({}),
  advances: jest.fn().mockResolvedValue({ items: [] }), statements: jest.fn().mockResolvedValue({ items: [] }),
  contract: jest.fn().mockResolvedValue({}), prepare: jest.fn().mockResolvedValue({}) });
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test('employee sees monthly gross and weekly cycle, and retries unknown advance acknowledgement with same key', async () => {
  const api = apiFixture(); api.submit.mockRejectedValueOnce({ code: 'TIMEOUT' });
  render(<EmployeePayrollPage api={api} />);
  await screen.findByText('Bán thời gian'); expect(screen.getByText('Gross/tháng')).toBeTruthy(); expect(screen.getByText('Hàng tuần')).toBeTruthy();
  fill('Số tiền (VND)', '1000000'); fill('Tháng đối trừ thỏa thuận', '2026-11'); fill('Mã thỏa thuận đối trừ', 'agreed-installment'); fill('Lý do đề nghị', 'Synthetic reason');
  fireEvent.click(screen.getByText('Gửi đề nghị'));
  await screen.findByText(/TIMEOUT/);
  fireEvent.click(screen.getByText('Gửi đề nghị'));
  await waitFor(() => expect(api.submit).toHaveBeenCalledTimes(2));
  expect(api.submit.mock.calls[0]).toEqual(api.submit.mock.calls[1]);
  expect(api.submit.mock.calls[0][0]).toEqual({ amountVnd: 1000000, settlementPeriod: '2026-11', settlementConsentReference: 'agreed-installment', reason: 'Synthetic reason' });
});

test('withdraw uses authoritative version and rejected request shows reason', async () => {
  const api = apiFixture(); api.own.mockResolvedValue({ contracts: [contract], statements: [], advances: [
    { id: 'pending', amountVnd: 1000000, status: 'SUBMITTED', version: 4, requestedAt: '2026-10-30', settlementPeriod: '2026-11', reason: 'Synthetic request' },
    { id: 'rejected', amountVnd: 500000, status: 'REJECTED', version: 1, requestedAt: '2026-10-29', settlementPeriod: '2026-11', reason: 'Synthetic request', decisionReason: 'Cần bổ sung hồ sơ' }
  ] });
  render(<EmployeePayrollPage api={api} />); await screen.findByText('Lý do quyết định: Cần bổ sung hồ sơ');
  fireEvent.click(screen.getByText('Rút đề nghị'));
  await waitFor(() => expect(api.advanceDecision).toHaveBeenCalledWith('pending', { action: 'WITHDRAW', expectedVersion: 4 }, expect.any(String)));
});

test('read failure shows recovery and never invents a contract', async () => {
  const api = apiFixture(); api.own.mockRejectedValueOnce({ code: 'FORBIDDEN' });
  render(<EmployeePayrollPage api={api} />); await screen.findByRole('alert');
  expect(screen.queryByText('Bán thời gian')).toBeNull(); fireEvent.click(screen.getByText('Tải lại'));
  await screen.findByText('Bán thời gian');
});

test('Admin verifies contract with explicit workplace and approved monthly gross', async () => {
  const api = apiFixture(); render(<EmployeePayrollAdminPage api={api} />);
  await screen.findByText('Không có đề nghị chờ xử lý.');
  const form = screen.getByText('Lưu hợp đồng đã xác minh').closest('form');
  fireEvent.change(form.elements.employeeId, { target: { value: employeeId } });
  fill('Phút làm việc mỗi tuần', '2400');
  fill('Ngày ký', '2026-10-01'); fill('Ngày hiệu lực', '2026-10-02'); fill('Mã hồ sơ hợp đồng đã ký', 'signed-contract');
  fill('Vùng lương nơi làm việc', '1'); fill('Phường/xã và căn cứ xác định vùng', 'Synthetic verified workplace');
  fireEvent.submit(form);
  await waitFor(() => expect(api.contract).toHaveBeenCalledTimes(1));
  expect(api.contract.mock.calls[0][0]).toMatchObject({ monthlyBaseVnd: 10000000, salaryBasis: 'GROSS', payCycle: 'MONTHLY', workplaceRegion: 1 });
});

test('API uses payroll endpoints and preserves CSRF/idempotency transport contract', async () => {
  const request = jest.fn().mockResolvedValue({ data: { id: 'record' } }); const api = createEmployeePayrollApi(request);
  const body = { action: 'APPROVE', expectedVersion: 2 };
  expect(await api.advanceDecision(employeeId, body, 'stable-operation')).toEqual({ id: 'record' });
  expect(request).toHaveBeenCalledWith(`/payroll/advances/${employeeId}/decisions`, { method: 'POST', body, idempotencyKey: 'stable-operation' });
});
