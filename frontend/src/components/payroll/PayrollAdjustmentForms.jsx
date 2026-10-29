import { useState } from 'react';
import { PayrollField } from './PayrollDetails.jsx';

export function PayrollAdjustmentForm({ statement, state, api }) {
  const [direction, setDirection] = useState('SUPPLEMENT');
  if (!['APPROVED', 'PAID'].includes(statement.status)) return null;
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new window.FormData(form);
    const body = { statementId: statement.id, expectedVersion: statement.version, direction,
      amountVnd: Number(data.get('amountVnd')), reason: data.get('reason'), assessmentReference: data.get('assessmentReference') };
    if (await state.command(`adjust:${statement.id}`, body, key => api.submitAdjustment(body, key))) form.reset();
  };
  return <details><summary>Lập điều chỉnh</summary><form className="payroll-form" onSubmit={submit}>
    <label className="payroll-field"><span>Loại điều chỉnh</span><select value={direction} onChange={event => setDirection(event.target.value)}>
      <option value="SUPPLEMENT">Chi bổ sung</option>{statement.status === 'PAID' && <option value="RECOVERY">Chênh lệch cần đối soát</option>}
    </select></label>
    <PayrollField label="Số tiền điều chỉnh (VND)" name="amountVnd" type="number" min="1" step="1" />
    <PayrollField label="Lý do điều chỉnh" name="reason" maxLength={1000} />
    <PayrollField label="Mã hồ sơ đánh giá điều chỉnh" name="assessmentReference" maxLength={160} />
    <button type="submit" disabled={state.busy}>Gửi điều chỉnh chờ duyệt</button>
  </form></details>;
}

export function PayrollAdjustmentDecision({ row, state, api }) {
  const [action, setAction] = useState('APPROVE');
  if (!['SUBMITTED', 'APPROVED'].includes(row.status)) return null;
  const decision = row.status === 'SUBMITTED';
  const submit = async event => {
    event.preventDefault(); const data = new window.FormData(event.currentTarget);
    const body = { expectedVersion: row.version, action: decision ? action : row.direction === 'SUPPLEMENT' ? 'RECORD_PAYMENT' : 'RECONCILE' };
    if (decision) body.reason = data.get('reason');
    else if (row.direction === 'SUPPLEMENT') body.transferReference = data.get('transferReference');
    else { body.agreementReference = data.get('agreementReference'); body.resolutionReference = data.get('resolutionReference'); }
    await state.command(`adjustment-decision:${row.id}`, body, key => api.adjustmentDecision(row.id, body, key));
  };
  return <form className="payroll-form" onSubmit={submit}>{decision ? <>
    <label className="payroll-field"><span>Quyết định điều chỉnh</span><select value={action} onChange={event => setAction(event.target.value)}><option value="APPROVE">Duyệt</option><option value="REJECT">Từ chối</option></select></label>
    <PayrollField label="Lý do quyết định điều chỉnh" name="reason" maxLength={1000} />
  </> : row.direction === 'SUPPLEMENT' ? <PayrollField label="Mã giao dịch chi bổ sung đã thực hiện" name="transferReference" maxLength={160} /> : <>
    <PayrollField label="Mã thỏa thuận xử lý chênh lệch" name="agreementReference" maxLength={160} />
    <PayrollField label="Mã chứng từ hoàn tất đối soát" name="resolutionReference" maxLength={160} />
  </>}
    <button type="submit" disabled={state.busy}>{decision ? 'Lưu quyết định điều chỉnh' : row.direction === 'SUPPLEMENT' ? 'Ghi nhận chi bổ sung' : 'Ghi nhận đối soát'}</button>
  </form>;
}
