import { useCallback, useId, useState } from 'react';
import { Button, Dialog } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { VISIT_WITHDRAWAL_REASON_LABELS } from '../../constants/visit-withdrawal-messages.js';
import { formatClosureSlot } from '../../utils/visit-closure-format.js';

export function WithdrawalReviewDialog({ visitId, api, onClose, onDone }) {
  const formId = useId(), [reason, setReason] = useState(''), [decision, setDecision] = useState('RELEASE');
  const load = useCallback(({ signal }) => api.withdrawalReview(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load), row = resource.data;
  const command = useSchedulingCommand(result => onDone(result.data));
  const locked = command.busy || command.pending;
  function submit(event) {
    event.preventDefault();
    if (!row || !reason.trim() || locked) return;
    const body = { expectedVersion: row.version, decision, reason: reason.trim() };
    command.execute(key => api.decideWithdrawal(visitId, body, key));
  }
  return <Dialog open title="Xử lý yêu cầu rút ca" onClose={onClose} dismissible={!locked}
    footer={<>
      <Button variant="secondary" disabled={locked} onClick={onClose}>Đóng</Button>
      {command.pending ? <Button onClick={command.retry} loading={command.busy}>Kiểm tra lại yêu cầu</Button>
        : <Button type="submit" form={formId} loading={command.busy} disabled={!row || !reason.trim()}>Ghi nhận quyết định</Button>}
    </>}>
    {resource.status === 'loading' && <p role="status">Đang tải yêu cầu…</p>}
    {!row && resource.status !== 'loading' && <p role="alert">Yêu cầu không còn chờ xử lý hoặc chưa tải được. <button onClick={resource.retry}>Tải lại</button></p>}
    {row && <form id={formId} onSubmit={submit}>
      <p><strong>{row.serviceName ?? 'Ca chăm sóc'}</strong> · {formatClosureSlot(row.startAt, row.endAt)}</p>
      <p>Người chăm sóc: {row.sitterName ?? 'Chưa có tên'}</p>
      <p>Lý do yêu cầu: {VISIT_WITHDRAWAL_REASON_LABELS[row.reasonCode] ?? 'Cần liên hệ người chăm sóc'}</p>
      {row.note && <p>{row.note}</p>}
      <p>Chấp nhận sẽ trả ca về điều phối. Lịch khách chỉ định cần khách xác nhận người thay thế. Quyết định này không tự hủy đơn hay thay đổi phí.</p>
      <label>Kết quả xử lý<select value={decision} disabled={locked} onChange={event => setDecision(event.target.value)}>
        <option value="RELEASE">Chấp nhận rút, sắp xếp lại ca</option><option value="REJECT">Chưa chấp nhận, giữ phân công</option>
      </select></label>
      <label>Lý do quyết định<textarea value={reason} maxLength={1000} required disabled={locked} onChange={event => setReason(event.target.value)} /></label>
    </form>}
    {command.message && <p role="status">{command.message}</p>}
  </Dialog>;
}
