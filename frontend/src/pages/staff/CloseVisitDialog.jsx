import { useCallback, useId, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { CLOSURE_ERROR_MESSAGES, CLOSURE_REASON_MAX_LENGTH, formatBookingRef, formatClosureSlot, formatClosureTime } from '../../utils/visit-closure-format.js';
import './visit-closure.css';

export function CloseVisitDialog({ visitId, api, onClose, onClosed, canVerify = false }) {
  const formId = useId();
  const [reason, setReason] = useState(''), [touched, setTouched] = useState(false);
  const [outcome, setOutcome] = useState('SERVICE_PERFORMED'), [actualEnd, setActualEnd] = useState('');
  const [evidence, setEvidence] = useState(''), [reportsComplete, setReportsComplete] = useState(false);
  const load = useCallback(({ signal }) => api.closureDetails(visitId, { signal }), [api, visitId]);
  const details = useApiResource(load), command = useSchedulingCommand(result => onClosed(result.data));
  const data = details.status === 'success' ? details.data : null;
  const review = data?.state === 'STAFF_CLOSED', verify = review && canVerify && !data.verification;
  const locked = command.busy || command.pending;
  const missing = !reason.trim() || verify && (!evidence.trim() || outcome === 'SERVICE_PERFORMED' && !Number.isFinite(Date.parse(actualEnd + ':00+07:00')));
  function submit(event) {
    event.preventDefault(); setTouched(true);
    if (!data || locked || missing || review && !verify) return;
    const body = { expectedVersion: data.version, reason: reason.trim() };
    if (verify) Object.assign(body, { outcome, evidenceReference: evidence.trim(), ...(outcome === 'SERVICE_PERFORMED'
      ? { actualEndedAt: new Date(actualEnd + ':00+07:00').toISOString(), reportsComplete } : {}) });
    command.execute(key => verify ? api.verifyClosure(visitId, body, key) : api.closeVisit(visitId, body, key));
  }
  return <Dialog open title={review ? 'Đối chiếu buổi đã đóng' : 'Đóng buổi chưa check-out'} onClose={onClose} dismissible={false} className="visit-closure-dialog"
    footer={<>
      <Button variant="secondary" disabled={command.busy} onClick={onClose}>Quay lại</Button>
      {command.pending ? <Button loading={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>
        : (!review || verify) && <Button type="submit" form={formId} loading={command.busy} disabled={!data}>{verify ? 'Xác minh bằng chứng' : 'Đóng buổi'}</Button>}
    </>}>
    {details.status === 'loading' && <p role="status">Đang tải thông tin buổi…</p>}
    {!data && details.status !== 'loading' && <p role="alert">{CLOSURE_ERROR_MESSAGES[details.code] ?? 'Chưa tải được thông tin buổi.'}</p>}
    {data && <form id={formId} onSubmit={submit} noValidate>
      <dl className="visit-closure-dialog__facts">
        <div><dt>Buổi</dt><dd>{`${formatBookingRef(data)} · ${formatClosureSlot(data.startAt, data.endAt)}`}</dd></div>
        <div><dt>Người chăm sóc</dt><dd>{data.sitterName ?? 'Chưa rõ'}</dd></div>
        <div><dt>Check-in</dt><dd>{`${formatClosureTime(data.checkInAt)}, ${data.hasCheckInPhoto ? 'có ảnh check-in' : 'không có ảnh check-in'}`}</dd></div>
        {data.closure && <div><dt>Lý do đóng buổi</dt><dd>{data.closure.reason}</dd></div>}
      </dl>
      <p className="visit-closure-dialog__notice"><CircleAlert size={17} aria-hidden="true" />
        <span>{data.verification ? 'Buổi đã được quản trị đối chiếu.' : review
          ? 'Buổi đang chờ quản trị xác minh dịch vụ và giờ kết thúc thực tế. Trường hợp không thực hiện dịch vụ cần đối soát phí, hoàn tiền riêng.'
          : 'Đóng buổi để chuyển sang chờ quản trị đối chiếu. Ảnh check-in không thay thế bằng chứng kết thúc; chưa tự ghi nhận công, miễn phí hoặc hoàn tiền.'}</span>
      </p>
      {verify && <fieldset disabled={locked}><legend>Bằng chứng thực hiện dịch vụ</legend>
        <label>Kết quả đối chiếu<select value={outcome} onChange={event => setOutcome(event.target.value)}>
          <option value="SERVICE_PERFORMED">Đã thực hiện dịch vụ</option><option value="NO_SERVICE">Không thực hiện dịch vụ</option>
        </select></label>
        <label>Tham chiếu bằng chứng đã kiểm tra<input maxLength={160} value={evidence} onChange={event => setEvidence(event.target.value)} required /></label>
        {outcome === 'SERVICE_PERFORMED' && <>
          <label>Giờ kết thúc thực tế (giờ Việt Nam)<input type="datetime-local" value={actualEnd} onChange={event => setActualEnd(event.target.value)} required /></label>
          <label><input type="checkbox" checked={reportsComplete} onChange={event => setReportsComplete(event.target.checked)} />Đã đối chiếu đủ báo cáo chăm sóc</label>
          <p>Điền giờ từ bằng chứng đã xác minh; giờ dự kiến không được dùng thay giờ thực tế.</p>
        </>}
      </fieldset>}
      {(!review || verify) && <label>Lý do <span aria-hidden="true">*</span>
        <textarea value={reason} rows={4} maxLength={CLOSURE_REASON_MAX_LENGTH} disabled={locked}
          aria-required="true" aria-invalid={touched && !reason.trim() ? 'true' : undefined} onChange={event => setReason(event.target.value)} />
      </label>}
      {touched && missing && <p role="alert" className="visit-closure-dialog__error">{verify ? 'Nhập lý do, tham chiếu bằng chứng và giờ kết thúc thực tế nếu có thực hiện dịch vụ.' : 'Nhập lý do đóng buổi.'}</p>}
    </form>}
    {command.message && <p role="status" className="visit-closure-dialog__error">{command.message}</p>}
  </Dialog>;
}
