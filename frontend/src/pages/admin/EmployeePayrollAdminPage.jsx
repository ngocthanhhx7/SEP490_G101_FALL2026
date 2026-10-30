import { useCallback, useRef, useState } from 'react';
import { usePayrollWorkspace } from '../../hooks/usePayrollWorkspace.js';
import { PayrollStatement, PayrollAdjustment, PayrollField, PayrollLoadState, PayrollPager, money, payrollStatus } from '../../components/payroll/PayrollDetails.jsx';
import { PayrollAdjustmentForm, PayrollAdjustmentDecision } from '../../components/payroll/PayrollAdjustmentForms.jsx';
import { EmployeeContractForm } from '../../components/payroll/EmployeeContractForm.jsx';

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
  if (!['SUBMITTED', 'PREPARED', 'APPROVED'].includes(row.status)) return null;
  return <form className="payroll-form" onSubmit={decide}>
    {row.status === 'APPROVED' ? <>
      <input type="hidden" name="action" value="RECORD_PAYMENT" />
      <PayrollField label="Mã giao dịch ngân hàng đã thực hiện" name="transferReference" maxLength={160} />
      <button disabled={state.busy} type="submit">Ghi nhận đã chi trả</button>
    </> : <>
      <label className="payroll-field"><span>Quyết định</span><select name="action" value={action} onChange={event => setAction(event.target.value)}>
        <option value="APPROVE">Duyệt</option><option value="REJECT">{kind === 'advance' ? 'Từ chối' : 'Hủy phiếu chờ duyệt'}</option>
      </select></label>
      {action === 'REJECT' && <PayrollField label="Lý do từ chối" name="reason" maxLength={1000} />}
      <button disabled={state.busy} type="submit">Lưu quyết định</button>
    </>}
  </form>;
}

export function EmployeePayrollAdminPage({ api, employeeApi }) {
  const loadEmployee = useCallback((id, options) => employeeApi.get(id, options), [employeeApi]);
  const [advancePages, setAdvancePages] = useState([null]), [statementPages, setStatementPages] = useState([null]);
  const [adjustmentPages, setAdjustmentPages] = useState([null]);
  const [history, setHistory] = useState(false);
  const advanceCursor = advancePages.at(-1), statementCursor = statementPages.at(-1);
  const adjustmentCursor = adjustmentPages.at(-1);
  const load = useCallback(async ({ signal }) => {
    const [advances, statements, adjustments] = await Promise.all([api.advances({ signal, cursor: advanceCursor, view: history ? 'HISTORY' : 'PENDING' }), api.statements({ signal, cursor: statementCursor }), api.adjustments({ signal, cursor: adjustmentCursor })]);
    return { advances: advances.items, statements: statements.items, adjustments: adjustments.items,
      advanceNextCursor: advances.nextCursor, statementNextCursor: statements.nextCursor, adjustmentNextCursor: adjustments.nextCursor };
  }, [api, advanceCursor, statementCursor, adjustmentCursor, history]);
  const state = usePayrollWorkspace(load);
  const [installments, setInstallments] = useState([]);
  const contractBody = useRef(null);
  const [contractLocked, setContractLocked] = useState(false), [contractRevision, setContractRevision] = useState(0);
  const saveContract = async body => {
    contractBody.current ??= body;
    const saved = await state.command('contract', contractBody.current, async key => {
      try { return await api.contract(contractBody.current, key); }
      catch (error) {
        const uncertain = !error.status || error.status >= 500 || ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code);
        setContractLocked(uncertain);
        if (!uncertain) { contractBody.current = null; if (error.code === 'VERSION_CONFLICT') setContractRevision(value => value + 1); }
        throw error;
      }
    });
    if (saved) { contractBody.current = null; setContractLocked(false); setContractRevision(value => value + 1); }
    return saved;
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
      <EmployeeContractForm key={contractRevision} busy={state.busy} locked={contractLocked} onSave={saveContract} loadEmployee={employeeApi ? loadEmployee : undefined} />
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
    <section><h2>{history ? 'Lịch sử tạm ứng' : 'Tạm ứng chờ xử lý'}</h2>
      <p><label className="payroll-check"><input type="checkbox" checked={history} disabled={state.busy} onChange={event => { setHistory(event.target.checked); setAdvancePages([null]); }} />Hiện lịch sử tạm ứng</label></p>
      {state.data && <>{!state.data.advances.length && <p>{history ? 'Chưa có đề nghị tạm ứng.' : 'Không có đề nghị chờ xử lý.'}</p>}
        {state.data.advances.map(row => <article key={row.id} className="payroll-statement"><header><h2>{money(row.amountVnd)}</h2><span>{payrollStatus(row.status)}</span></header>
          <p>Nhân viên: {row.employeeId}</p><p>{row.reason}</p><p>Tháng đề nghị: {row.monthKey} · Đối trừ: {row.settlementPeriod}</p>
          {row.decisionReason && <p>Lý do quyết định: {row.decisionReason}</p>}
          <DecisionForm row={row} kind="advance" state={state} api={api} />
        </article>)}
        <PayrollPager label="tạm ứng" pages={advancePages} setPages={setAdvancePages} nextCursor={state.data.advanceNextCursor} busy={state.busy} />
      </>}
      </section>{state.data && <section><h2>Phiếu lương</h2>{!state.data.statements.length && <p>Chưa có phiếu lương.</p>}
        {state.data.statements.map(row => <PayrollStatement key={row.id} statement={row}><p>Nhân viên: {row.employeeId}</p><DecisionForm row={row} kind="statement" state={state} api={api} /><PayrollAdjustmentForm statement={row} state={state} api={api} /></PayrollStatement>)}
        <PayrollPager label="phiếu lương" pages={statementPages} setPages={setStatementPages} nextCursor={state.data.statementNextCursor} busy={state.busy} />
      </section>}
    {state.data && <section><h2>Điều chỉnh lương</h2>{!state.data.adjustments.length && <p>Chưa có điều chỉnh.</p>}
      {state.data.adjustments.map(row => <PayrollAdjustment key={row.id} row={row}><p>Nhân viên: {row.employeeId}</p>
        <p>Hồ sơ đánh giá: {row.assessmentReference}</p>{row.agreementReference && <p>Thỏa thuận: {row.agreementReference}</p>}
        {row.resolutionReference && <p>Chứng từ đối soát: {row.resolutionReference}</p>}{row.transferReference && <p>Giao dịch: {row.transferReference}</p>}
        <PayrollAdjustmentDecision row={row} state={state} api={api} /></PayrollAdjustment>)}
      <PayrollPager label="điều chỉnh" pages={adjustmentPages} setPages={setAdjustmentPages} nextCursor={state.data.adjustmentNextCursor} busy={state.busy} />
    </section>}
  </section>;
}
