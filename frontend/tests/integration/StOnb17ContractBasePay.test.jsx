import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EmploymentContractEditor } from '../../src/components/payroll/EmploymentContractEditor.jsx';
import { EmployeeContractForm } from '../../src/components/payroll/EmployeeContractForm.jsx';

jest.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ getCsrfToken: () => 'synthetic-csrf' })
}));

afterEach(cleanup);

const application = {
  id: 'a'.repeat(24),
  version: 2,
  state: 'INTERVIEW',
  displayName: 'Synthetic Part-Time Applicant',
  employmentType: 'PART_TIME'
};

test('ST-ONB-17 EmploymentContractEditor keeps monthlyBaseVnd read-only from payPolicy and updates on contract type change', async () => {
  const api = {
    get: jest.fn().mockResolvedValue({
      current: null,
      history: [],
      payPolicy: {
        ready: true,
        version: 'PWC-POLICY-TEST',
        fullTimeMonthlyBaseVnd: 11500000,
        partTimeMonthlyBaseVnd: 4200000
      }
    }),
    save: jest.fn().mockResolvedValue({ state: 'DRAFT' })
  };

  render(<EmploymentContractEditor application={application} api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Soạn hợp đồng' }));

  const baseInput = screen.getByLabelText('Lương gross theo công việc/tháng (VND)');
  expect(baseInput).toHaveAttribute('readonly');
  expect(baseInput).toHaveValue(4200000);

  const allowanceInput = screen.getByLabelText('Phụ cấp cố định/tháng (VND)');
  expect(allowanceInput).not.toHaveAttribute('readonly');
  expect(allowanceInput).toHaveValue(0);
  expect(allowanceInput).toHaveAttribute('min', '0');

  // Switch contract type to FULL_TIME -> read-only base pay switches automatically to policy full-time value
  fireEvent.change(screen.getByLabelText('Hình thức làm việc'), { target: { value: 'FULL_TIME' } });
  const updatedBaseInput = screen.getByLabelText('Lương gross theo công việc/tháng (VND)');
  expect(updatedBaseInput).toHaveAttribute('readonly');
  expect(updatedBaseInput).toHaveValue(11500000);
});

test('ST-ONB-17 EmployeeContractForm uses read-only policy monthlyBaseVnd and supports manual monthlyAllowanceVnd >= 0', async () => {
  const onSave = jest.fn().mockResolvedValue(true);
  render(
    <EmployeeContractForm
      employeeId={'b'.repeat(24)}
      expectedVersion={1}
      preferredEmploymentType="PART_TIME"
      payPolicy={{
        ready: true,
        version: 'PWC-POLICY-TEST',
        fullTimeMonthlyBaseVnd: 12000000,
        partTimeMonthlyBaseVnd: 4500000
      }}
      onSave={onSave}
    />
  );

  const baseInput = screen.getByLabelText('Lương gross/tháng (VND)');
  expect(baseInput).toHaveAttribute('readonly');
  expect(baseInput).toHaveValue('4500000');

  const allowanceInput = screen.getByLabelText('Phụ cấp hằng tháng (VND)');
  expect(allowanceInput).not.toHaveAttribute('readonly');
  expect(allowanceInput).toHaveValue(0);
  expect(allowanceInput).toHaveAttribute('min', '0');

  fireEvent.change(allowanceInput, { target: { value: '500000' } });
  fireEvent.change(screen.getByLabelText('Ngày ký'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-11-02' } });
  fireEvent.change(screen.getByLabelText('Mã hồ sơ hợp đồng đã ký'), { target: { value: 'HD-ADD-01' } });
  fireEvent.change(screen.getByLabelText('Vùng lương nơi làm việc'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Phường/xã và căn cứ xác định vùng'), { target: { value: 'Cau Giay, Ha Noi' } });

  fireEvent.submit(screen.getByRole('button', { name: 'Lưu hợp đồng đã xác minh' }).closest('form'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toMatchObject({
    employmentType: 'PART_TIME',
    monthlyBaseVnd: 4500000,
    monthlyAllowanceVnd: 500000
  });
});
