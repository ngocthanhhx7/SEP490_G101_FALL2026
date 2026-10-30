import { useCallback, useState } from 'react';
import { PayrollField } from './PayrollDetails.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button } from '../ui/index.js';
import { FileCheck2 } from 'lucide-react';

export function EmployeeContractForm({ employeeId, expectedVersion = 0, busy, locked = false, onSave, loadEmployee }) {
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [draftEmployeeId, setDraftEmployeeId] = useState(employeeId ?? '');
  const load = useCallback(async ({ signal }) => {
    if (!loadEmployee || !/^[a-f0-9]{24}$/i.test(draftEmployeeId)) return { data: null };
    return loadEmployee(draftEmployeeId, { signal });
  }, [loadEmployee, draftEmployeeId]);
  const employee = useApiResource(load);
  const selected = employee.data?.id === draftEmployeeId && employee.data?.permissions?.manageContract
    && Number.isSafeInteger(employee.data?.contractVersion) ? employee.data : null;
  const version = loadEmployee ? selected?.contractVersion ?? '' : expectedVersion;
  async function submit(event) {
    event.preventDefault();
    if (busy || (!locked && loadEmployee && !selected)) return;
    const form = event.currentTarget, data = new window.FormData(form);
    const body = locked ? null : {
      employeeId: employeeId ?? data.get('employeeId'),
      expectedVersion: employeeId || loadEmployee ? version : Number(data.get('expectedVersion')),
      employmentType, salaryBasis: 'GROSS', monthlyBaseVnd: employmentType === 'FULL_TIME' ? 10000000 : 3000000,
      payCycle: employmentType === 'FULL_TIME' ? 'MONTHLY' : data.get('payCycle'), weeklyMinutes: Number(data.get('weeklyMinutes')),
      signedAt: `${data.get('signedAt')}T00:00:00+07:00`, effectiveAt: `${data.get('effectiveAt')}T00:00:00+07:00`,
      contractReference: data.get('contractReference'), workplaceRegion: Number(data.get('workplaceRegion')),
      workplaceReference: data.get('workplaceReference'),
      ...(data.get('endsAt') ? { endsAt: `${data.get('endsAt')}T00:00:00+07:00` } : {})
    };
    if (await onSave(body)) { form.reset(); setEmploymentType('FULL_TIME'); }
  }
  return <form onSubmit={submit}>
    <fieldset className="payroll-form employee-contract-fields" disabled={busy || locked}>
      <legend>Thông tin hợp đồng đã ký</legend>
      <PayrollField label="Mã nhân viên" name="employeeId" pattern="[a-fA-F0-9]{24}" maxLength={24} value={draftEmployeeId} onChange={event => setDraftEmployeeId(event.target.value.trim())} readOnly={Boolean(employeeId)} />
      {loadEmployee ? <PayrollField label="Phiên bản hợp đồng hiện tại" name="expectedVersion" type="number" value={version} readOnly />
        : <PayrollField label="Phiên bản hợp đồng hiện tại" name="expectedVersion" type="number" min="0" step="1" defaultValue={expectedVersion} readOnly={Boolean(employeeId)} />}
      {loadEmployee && <p role="status">{selected ? `Nhân viên: ${selected.displayName}` : employee.status === 'loading' ? 'Đang kiểm tra hồ sơ nhân viên…' : 'Nhập mã Pet Sitter đã được duyệt để tải phiên bản hợp đồng.'}</p>}
      {loadEmployee && ['error', 'forbidden'].includes(employee.status) && <p role="alert">Không tải được hồ sơ nhân viên. <button type="button" onClick={employee.retry}>Tải lại hồ sơ</button></p>}
      <label className="payroll-field"><span>Hình thức làm việc</span><select value={employmentType} onChange={event => setEmploymentType(event.target.value)}>
        <option value="FULL_TIME">Toàn thời gian</option><option value="PART_TIME">Bán thời gian</option>
      </select></label>
      <PayrollField label="Lương gross/tháng (VND)" name="monthlyBaseVnd" value={employmentType === 'FULL_TIME' ? 10000000 : 3000000} readOnly />
      <PayrollField key={employmentType} label="Phút làm việc mỗi tuần" name="weeklyMinutes" type="number" min="1" max="2880" step="1" defaultValue={employmentType === 'PART_TIME' ? 1200 : ''} readOnly={employmentType === 'PART_TIME'} />
      {employmentType === 'PART_TIME' && <label className="payroll-field"><span>Kỳ trả theo hợp đồng</span><select name="payCycle"><option value="WEEKLY">Theo tuần</option><option value="MONTHLY">Theo tháng</option></select></label>}
      <PayrollField label="Ngày ký" name="signedAt" type="date" /><PayrollField label="Ngày hiệu lực" name="effectiveAt" type="date" />
      <PayrollField label="Ngày hết hiệu lực" name="endsAt" type="date" required={false} />
      <PayrollField label="Mã hồ sơ hợp đồng đã ký" name="contractReference" maxLength={160} />
      <label className="payroll-field"><span>Vùng lương nơi làm việc</span><select name="workplaceRegion" required defaultValue=""><option value="" disabled>Chọn vùng</option>{[1, 2, 3, 4].map(region => <option key={region} value={region}>Vùng {region}</option>)}</select></label>
      <PayrollField label="Phường/xã và căn cứ xác định vùng" name="workplaceReference" maxLength={160} />
    </fieldset>
    <Button disabled={busy || (!locked && loadEmployee && !selected)} type="submit"><FileCheck2 size={17} />{locked ? 'Kiểm tra lại cùng yêu cầu' : 'Lưu hợp đồng đã xác minh'}</Button>
  </form>;
}
