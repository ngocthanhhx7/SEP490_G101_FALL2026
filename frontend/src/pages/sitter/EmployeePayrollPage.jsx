import { useCallback, useState } from 'react';
import { usePayrollWorkspace } from '../../hooks/usePayrollWorkspace.js';
import { PayrollStatement, PayrollAdjustment, PayrollField, PayrollLoadState, PayrollPager, money, date, payrollStatus } from '../../components/payroll/PayrollDetails.jsx';

export function EmployeePayrollPage({ api }) {
  const [advancePages, setAdvancePages] = useState([null]), [statementPages, setStatementPages] = useState([null]);
  const [adjustmentPages, setAdjustmentPages] = useState([null]);
  const advanceCursor = advancePages.at(-1), statementCursor = statementPages.at(-1);
  const adjustmentCursor = adjustmentPages.at(-1);
  const load = useCallback(options => api.own({ ...options, advanceCursor, statementCursor, adjustmentCursor }), [api, advanceCursor, statementCursor, adjustmentCursor]);
  const state = usePayrollWorkspace(load);
  const contracts = state.data?.contracts || [];
  const today = new Date();
  const contract = Object.hasOwn(state.data || {}, 'activeContractId') ? contracts.find(c => c.id === state.data.activeContractId)
    : contracts.find(c => new Date(c.effectiveAt) <= today && (!c.endsAt || new Date(c.endsAt) > today));
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new window.FormData(form);
    const body = { amountVnd: Number(data.get('amountVnd')), reason: data.get('reason'), settlementPeriod: data.get('settlementPeriod'), settlementConsentReference: data.get('settlementConsentReference') };
    if (await state.command('submit', body, key => api.submit(body, key))) { form.reset(); setAdvancePages([null]); }
  };
  return <section className="payroll-workspace"><h1>Lương và tạm ứng</h1><PayrollLoadState state={state} />
    {state.data && <>
      <section><h2>Hợp đồng hiện tại</h2>{contract ? <div className="payroll-summary">
        <div><strong>{contract.employmentType === 'FULL_TIME' ? 'Toàn thời gian' : 'Bán thời gian'}</strong>{contract.weeklyMinutes / 60} giờ/tuần</div>
        <div><strong>{money(contract.monthlyBaseVnd)}</strong>Gross/tháng</div>
        <div><strong>{contract.payCycle === 'WEEKLY' ? 'Hàng tuần' : 'Hàng tháng'}</strong>Kỳ trả theo hợp đồng</div>
      </div> : <p>Chưa có hợp đồng đang hiệu lực được Admin xác minh.</p>}</section>
      <section><h2>Đề nghị tạm ứng</h2>{contract && <><p>Hạn mức: {money(Math.floor(contract.monthlyBaseVnd / 2))}/tháng.</p>
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
      </section><section><h2>Phiếu lương</h2>{!state.data.statements.length && <p>Chưa có phiếu lương.</p>}
        {state.data.statements.map(row => <PayrollStatement key={row.id} statement={row} />)}
        <PayrollPager label="phiếu lương" pages={statementPages} setPages={setStatementPages} nextCursor={state.data.statementNextCursor} busy={state.busy} />
      </section>
      <section><h2>Điều chỉnh lương</h2>{!(state.data.adjustments || []).length && <p>Chưa có điều chỉnh.</p>}
        {(state.data.adjustments || []).map(row => <PayrollAdjustment key={row.id} row={row} />)}
        <PayrollPager label="điều chỉnh" pages={adjustmentPages} setPages={setAdjustmentPages} nextCursor={state.data.adjustmentNextCursor} busy={state.busy} />
      </section>
    </>}
  </section>;
}
