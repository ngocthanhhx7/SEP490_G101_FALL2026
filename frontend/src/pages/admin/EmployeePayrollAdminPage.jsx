import { useCallback, useState } from 'react';
import { usePayrollWorkspace } from '../../hooks/usePayrollWorkspace.js';
import { PayrollStatement, PayrollField, PayrollLoadState, money, payrollStatus } from '../../components/payroll/PayrollDetails.jsx';

const employeeField = { label: 'Mã nhân viên', name: 'employeeId', pattern: '[a-fA-F0-9]{24}', maxLength: 24 };
const numberValue = (data, key) => Number(data.get(key));
const numericFields = [
  ['scheduledMonthMinutes', 'Tổng phút công chuẩn tháng', 1], ['paidPeriodMinutes', 'Phút công được trả kỳ này', 0],
  ['kpiTargetMinutes', 'Mục tiêu phút chăm sóc tháng đã duyệt', 0], ['overtimeVnd', 'Làm thêm / ban đêm (VND)', 0],
  ['employeeInsuranceVnd', 'Bảo hiểm NLĐ đã xác minh (VND)', 0], ['incomeTaxVnd', 'Thuế TNCN đã xác minh (VND)', 0],
  ['otherLawfulDeductionsVnd', 'Khấu trừ hợp lệ khác (VND)', 0]
];
function DecisionForm({ row, kind, state, api }) {
  const decide = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new window.FormData(form);
    const body = { expectedVersion: row.version, action: data.get('action') };
    if (body.action === 'REJECT') body.reason = data.get('reason');
    if (body.action === 'RECORD_PAYMENT') body.transferReference = data.get('transferReference');
    await state.command(`${kind}:${row.id}`, body, key => api[kind === 'advance' ? 'advanceDecision' : 'statementDecision'](row.id, body, key));
  };
  const [action, setAction] = useState('APPROVE');
  if (row.status === 'PAID') return null;
  return <form className="payroll-form" onSubmit={decide}>
    {row.status === 'APPROVED' ? <>
      <input type="hidden" name="action" value="RECORD_PAYMENT" />
      <PayrollField label="Mã giao dịch ngân hàng đã thực hiện" name="transferReference" maxLength={160} />
      <button disabled={state.busy} type="submit">Ghi nhận đã chi trả</button>
    </> : <>
      <label className="payroll-field"><span>Quyết định</span><select name="action" value={action} onChange={event => setAction(event.target.value)}>
        <option value="APPROVE">Duyệt</option>{kind === 'advance' && <option value="REJECT">Từ chối</option>}
      </select></label>
      {action === 'REJECT' && <PayrollField label="Lý do từ chối" name="reason" maxLength={1000} />}
      <button disabled={state.busy} type="submit">Lưu quyết định</button>
    </>}
  </form>;
}

export function EmployeePayrollAdminPage({ api }) {
  const load = useCallback(async ({ signal }) => {
    const [advances, statements] = await Promise.all([api.advances({ signal }), api.statements({ signal })]);
    return { advances: advances.items, statements: statements.items };
  }, [api]);
  const state = usePayrollWorkspace(load);
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [installments, setInstallments] = useState([]);
  const saveContract = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new window.FormData(form);
    const body = { employeeId: data.get('employeeId'), expectedVersion: numberValue(data, 'expectedVersion'),
      employmentType, salaryBasis: 'GROSS', monthlyBaseVnd: employmentType === 'FULL_TIME' ? 10000000 : 3000000,
      payCycle: employmentType === 'FULL_TIME' ? 'MONTHLY' : data.get('payCycle'), weeklyMinutes: numberValue(data, 'weeklyMinutes'),
      signedAt: `${data.get('signedAt')}T00:00:00+07:00`, effectiveAt: `${data.get('effectiveAt')}T00:00:00+07:00`,
      contractReference: data.get('contractReference'), workplaceRegion: numberValue(data, 'workplaceRegion'), workplaceReference: data.get('workplaceReference') };
    if (data.get('endsAt')) body.endsAt = `${data.get('endsAt')}T00:00:00+07:00`;
    if (await state.command('contract', body, key => api.contract(body, key))) form.reset();
  };
  const prepare = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new window.FormData(form);
    const body = { employeeId: data.get('employeeId'),
      ...Object.fromEntries(['periodStart', 'periodEnd', 'dueAt'].map(key => [key, `${data.get(key)}T00:00:00+07:00`])),
      ...Object.fromEntries(numericFields.map(([key]) => [key, numberValue(data, key)])),
      seriousViolationConfirmed: data.get('seriousViolationConfirmed') === 'on', includeMonthlyBonus: data.get('includeMonthlyBonus') === 'on',
      assessmentReference: data.get('assessmentReference'), deductionConsentReference: data.get('deductionConsentReference'),
      advanceRepayments: installments.map(item => ({ advanceId: data.get(`advance:${item}`), amountVnd: numberValue(data, `amount:${item}`), agreementReference: data.get(`agreement:${item}`) })) };
    if (await state.command('prepare', body, key => api.prepare(body, key))) { form.reset(); setInstallments([]); }
  };
  return <section className="payroll-workspace"><h1>Quản lý lương</h1><PayrollLoadState state={state} />
    <section><details><summary>Xác minh hợp đồng đã ký</summary>
      <form className="payroll-form" onSubmit={saveContract}>
        <PayrollField {...employeeField} /><PayrollField label="Phiên bản hợp đồng hiện tại" name="expectedVersion" type="number" min="0" step="1" defaultValue="0" />
        <label className="payroll-field"><span>Hình thức làm việc</span><select value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
          <option value="FULL_TIME">Toàn thời gian · 10.000.000đ gross/tháng</option><option value="PART_TIME">Bán thời gian · 3.000.000đ gross/tháng</option>
        </select></label>
        <PayrollField key={employmentType} label="Phút làm việc mỗi tuần" name="weeklyMinutes" type="number" min="1" max="2880" step="1" defaultValue={employmentType === 'PART_TIME' ? 1200 : 2400} readOnly={employmentType === 'PART_TIME'} />
        {employmentType === 'PART_TIME' && <label className="payroll-field"><span>Kỳ trả theo hợp đồng</span><select name="payCycle"><option value="WEEKLY">Theo tuần</option><option value="MONTHLY">Theo tháng</option></select></label>}
        <PayrollField label="Ngày ký" name="signedAt" type="date" /><PayrollField label="Ngày hiệu lực" name="effectiveAt" type="date" />
        <PayrollField label="Ngày hết hiệu lực" name="endsAt" type="date" required={false} />
        <PayrollField label="Mã hồ sơ hợp đồng đã ký" name="contractReference" maxLength={160} />
        <label className="payroll-field"><span>Vùng lương nơi làm việc</span><select name="workplaceRegion" required defaultValue=""><option value="" disabled>Chọn vùng</option>{[1, 2, 3, 4].map(region => <option key={region} value={region}>Vùng {region}</option>)}</select></label>
        <PayrollField label="Phường/xã và căn cứ xác định vùng" name="workplaceReference" maxLength={160} />
        <button disabled={state.busy} type="submit">Lưu hợp đồng đã xác minh</button>
      </form>
    </details></section>
    <section><details><summary>Lập phiếu lương</summary><form onSubmit={prepare}>
      <div className="payroll-form"><PayrollField {...employeeField} />
        <PayrollField label="Từ ngày" name="periodStart" type="date" /><PayrollField label="Đến trước ngày" name="periodEnd" type="date" /><PayrollField label="Hạn trả" name="dueAt" type="date" />
        {numericFields.map(([name, label, min]) => <PayrollField key={name} label={label} name={name} type="number" min={min} step="1" />)}
        <PayrollField label="Mã hồ sơ công / thuế / bảo hiểm đã xác minh" name="assessmentReference" maxLength={160} />
        <PayrollField label="Căn cứ khấu trừ / thỏa thuận" name="deductionConsentReference" maxLength={160} />
      </div>
      <p><label className="payroll-check"><input type="checkbox" name="includeMonthlyBonus" />Chốt thưởng KPI tháng đã kết thúc</label></p>
      <p><label className="payroll-check"><input type="checkbox" name="seriousViolationConfirmed" />Có vi phạm nghiêm trọng đã kết luận trong tháng</label></p>
      {installments.map(item => <div key={item} className="payroll-form">
        <PayrollField label="Mã tạm ứng đã chi" name={`advance:${item}`} pattern="[a-fA-F0-9]{24}" />
        <PayrollField label="Số tiền đối trừ kỳ này (VND)" name={`amount:${item}`} type="number" min="1" step="1" />
        <PayrollField label="Mã thỏa thuận trả khoản ứng" name={`agreement:${item}`} maxLength={160} />
        <button type="button" onClick={() => setInstallments(rows => rows.filter(id => id !== item))}>Bỏ khoản đối trừ</button>
      </div>)}
      <div className="payroll-form"><button type="button" disabled={installments.length >= 12 || state.busy} onClick={() => setInstallments(rows => [...rows, globalThis.crypto.randomUUID()])}>Thêm khoản đối trừ tạm ứng</button>
        <button disabled={state.busy} type="submit">Lập phiếu lương</button></div>
    </form></details></section>
    {state.data && <>
      <section><h2>Tạm ứng chờ xử lý</h2>{!state.data.advances.length && <p>Không có đề nghị chờ xử lý.</p>}
        {state.data.advances.map(row => <article key={row.id} className="payroll-statement"><header><h2>{money(row.amountVnd)}</h2><span>{payrollStatus(row.status)}</span></header>
          <p>Nhân viên: {row.employeeId}</p><p>{row.reason}</p><p>Tháng đề nghị: {row.monthKey} · Đối trừ: {row.settlementPeriod}</p>
          <DecisionForm row={row} kind="advance" state={state} api={api} />
        </article>)}
      </section><section><h2>Phiếu lương</h2>{!state.data.statements.length && <p>Chưa có phiếu lương.</p>}
        {state.data.statements.map(row => <PayrollStatement key={row.id} statement={row}><p>Nhân viên: {row.employeeId}</p><DecisionForm row={row} kind="statement" state={state} api={api} /></PayrollStatement>)}
      </section>
    </>}
  </section>;
}
