import { useCallback, useState } from 'react';
import { usePayrollWorkspace } from '../../hooks/usePayrollWorkspace.js';
import { PayrollStatement, PayrollAdjustment, PayrollField, PayrollLoadState, PayrollPager, money, date, payrollStatus } from '../../components/payroll/PayrollDetails.jsx';

import { formatVietnamDate } from '../../utils/calendar-date.js';

const MSG66_ADVANCE_SENT = 'Đề nghị của bạn đã được gửi cho Admin.';

export function EmployeePayrollPage({ api }) {
  const [advancePages, setAdvancePages] = useState([null]), [statementPages, setStatementPages] = useState([null]);
  const [adjustmentPages, setAdjustmentPages] = useState([null]);
  const advanceCursor = advancePages.at(-1), statementCursor = statementPages.at(-1);
  const adjustmentCursor = adjustmentPages.at(-1);
  const load = useCallback(options => api.own({ ...options, advanceCursor, statementCursor, adjustmentCursor }), [api, advanceCursor, statementCursor, adjustmentCursor]);
  const state = usePayrollWorkspace(load);
  const contracts = state.data?.contracts || [];
  let contract;
  if (Object.hasOwn(state.data || {}, 'activeContractId')) {
    contract = contracts.find(c => c.id === state.data.activeContractId);
  } else {
    const asOf = new Date();
    const effective = contracts.find(c => new Date(c.effectiveAt) <= asOf);
    if (effective && (!effective.endsAt || new Date(effective.endsAt) > asOf)) contract = effective;
  }
  const contractEndDate = formatVietnamDate(contract?.endsOn ?? contract?.endsAt);
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new window.FormData(form);
    const body = { amountVnd: Number(data.get('amountVnd')), reason: data.get('reason'), settlementPeriod: data.get('settlementPeriod'), settlementConsentReference: data.get('settlementConsentReference') };
    if (await state.command('submit', body, key => api.submit(body, key), { successMessage: MSG66_ADVANCE_SENT })) {
      form.reset();
      setAdvancePages([null]);
    }
  };
  const showToast = state.messageKind === 'success' && state.message === MSG66_ADVANCE_SENT;
  const loadState = showToast ? { ...state, message: null } : state;
  return <section className="payroll-workspace sitter-payroll"><h1 data-duplicate-title>Lương và tạm ứng</h1>
    {showToast && <div className="payroll-toast" role="status" aria-live="polite">
      <span>{state.message}</span>
      <button type="button" aria-label="Đóng thông báo" onClick={state.clearMessage}>×</button>
    </div>}
    <PayrollLoadState state={loadState} />
    {state.data && <>
      <nav className="sitter-availability__jump" aria-label="Lương và tạm ứng"><a href="#sitter-pay-slips">Phiếu lương</a><a href="#sitter-pay-advance">Tạm ứng</a><a href="#sitter-pay-adjustments">Điều chỉnh</a></nav>
      <section><h2>Hợp đồng hiện tại</h2>{contract ? <div className="payroll-summary">
        <div><strong>{contract.employmentType === 'FULL_TIME' ? 'Toàn thời gian' : 'Bán thời gian'}</strong>{contract.workScheduleMode==='SELF_REGISTERED'?'Tối thiểu ':''}{contract.weeklyMinutes / 60} giờ/tuần</div>
        <div><strong>{money(contract.monthlyBaseVnd)}</strong>Gross/tháng</div>
        <div><strong>{contract.payCycle === 'WEEKLY' ? 'Hàng tuần' : 'Hàng tháng'}</strong>Kỳ trả theo hợp đồng</div>
        {contractEndDate && <div><strong>{contractEndDate}</strong>Ngày kết thúc</div>}
      </div> : <p>Chưa có hợp đồng đang hiệu lực được Admin xác minh.</p>}</section>
      <section><h2 id="sitter-pay-advance" tabIndex={-1}>Đề nghị tạm ứng</h2>{contract && <><p>Hạn mức: {money(Math.floor(contract.monthlyBaseVnd / 2))}/tháng.</p>
        <form className="payroll-form" onSubmit={submit}>
          <PayrollField label="Số tiền (VND)" name="amountVnd" type="number" min="1" max={Math.floor(contract.monthlyBaseVnd / 2)} step="1" />
          <PayrollField label="Tháng đối trừ thỏa thuận" name="settlementPeriod" type="month" />
          <PayrollField label="Mã thỏa thuận đối trừ" name="settlementConsentReference" maxLength={160} />
          <PayrollField label="Lý do đề nghị" name="reason" maxLength={1000} />
          <button disabled={state.busy} type="submit">Gửi đề nghị</button>
        </form></>}
        {!state.data.advances.length && <p>Chưa có đề nghị tạm ứng.</p>}
        {state.data.advances.map(row => <article className="payroll-statement" key={row.id}>
          <header><h2>{money(row.amountVnd)}</h2><span>{payrollStatus(row.status)}</span></header>
          <p>{date(row.requestedAt)} · Đối trừ: {row.settlementPeriod}</p><p>{row.reason}</p>
          {row.decisionReason && <p>Lý do quyết định: {row.decisionReason}</p>}
          {row.status === 'SUBMITTED' && <button disabled={state.busy} type="button" onClick={() => {
            const body = { action: 'WITHDRAW', expectedVersion: row.version };
            state.command(`withdraw:${row.id}`, body, key => api.advanceDecision(row.id, body, key));
          }}>Rút đề nghị</button>}
        </article>)}
        <PayrollPager label="tạm ứng" pages={advancePages} setPages={setAdvancePages} nextCursor={state.data.advanceNextCursor} busy={state.busy} />
      </section><section><h2 id="sitter-pay-slips" tabIndex={-1}>Phiếu lương</h2>{!state.data.statements.length && <p>Chưa có phiếu lương.</p>}
        {state.data.statements.map(row => <PayrollStatement key={row.id} statement={row} />)}
        <PayrollPager label="phiếu lương" pages={statementPages} setPages={setStatementPages} nextCursor={state.data.statementNextCursor} busy={state.busy} />
      </section>
      <section><h2 id="sitter-pay-adjustments" tabIndex={-1}>Điều chỉnh lương</h2>{!(state.data.adjustments || []).length && <p>Chưa có điều chỉnh.</p>}
        {(state.data.adjustments || []).map(row => <PayrollAdjustment key={row.id} row={row} />)}
        <PayrollPager label="điều chỉnh" pages={adjustmentPages} setPages={setAdjustmentPages} nextCursor={state.data.adjustmentNextCursor} busy={state.busy} />
      </section>
    </>}
  </section>;
}
