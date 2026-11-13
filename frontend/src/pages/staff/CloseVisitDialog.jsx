import { useCallback, useId, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CLOSURE_ERROR_MESSAGES, CLOSURE_NO_PHOTO_MESSAGE, CLOSURE_REASON_MAX_LENGTH, formatClosureSlot, formatClosureTime } from '../../utils/visit-closure-format.js';
import './visit-closure.css';

const UNCERTAIN = ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE'];

// GBR-24 (R3 10.1.2): Staff close a visit that was not checked out, with a required reason.
export function CloseVisitDialog({ visitId, api, onClose, onClosed }) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const key = useRef(null);
  const load = useCallback(({ signal }) => api.closureDetails(visitId, { signal }), [api, visitId]);
  const details = useApiResource(load);
  const data = details.status === 'success' ? details.data : null;
  const missing = !reason.trim();
  // Closing without a check-in photo cancels the visit; that branch is not available yet, so the button stays locked.
  const blocked = data ? !data.hasCheckInPhoto : false;

  async function submit(event) {
    event.preventDefault();
    setTouched(true);
    if (!data || blocked || busy || missing) return;
    // The key stays the same while the outcome is unknown, so a retry cannot close the visit twice.
    key.current ??= `closure:${globalThis.crypto.randomUUID()}`;
    setBusy(true); setMessage(null);
    try {
      const result = await api.closeVisit(visitId, { expectedVersion: data.version, reason: reason.trim() }, key.current);
      if (result.pending || result.status === 202) { setMessage('Chưa nhận được xác nhận. Gửi lại cùng yêu cầu để kiểm tra.'); return; }
      onClosed(result.data);
    } catch (error) {
      const uncertain = !error.status || error.status >= 500 || UNCERTAIN.includes(error.code);
      if (!uncertain) key.current = null;
      if (['VERSION_CONFLICT', 'INVALID_STATE', 'CLOSE_NOT_ALLOWED_YET'].includes(error.code)) details.retry();
      setMessage(uncertain ? 'Chưa nhận được xác nhận. Gửi lại cùng yêu cầu để kiểm tra.'
        : CLOSURE_ERROR_MESSAGES[error.code] ?? 'Chưa thể đóng buổi. Kiểm tra dữ liệu và tải lại.');
    } finally { setBusy(false); }
  }

  return <Dialog open title="Đóng buổi chưa check-out" onClose={onClose} dismissible={false} className="visit-closure-dialog"
    footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>Quay lại</Button>
      <Button type="submit" form={formId} loading={busy} disabled={!data || blocked}>Đóng buổi</Button>
    </>}>
    {details.status === 'loading' && <p role="status">Đang tải thông tin buổi…</p>}
    {!data && details.status !== 'loading' && <p role="alert">{CLOSURE_ERROR_MESSAGES[details.code]
      ?? 'Chưa tải được buổi này. Buổi chỉ đóng được 2 giờ sau giờ kết thúc nếu chưa check-out.'}</p>}
    {data && <form id={formId} onSubmit={submit} noValidate>
      <dl className="visit-closure-dialog__facts">
        <div><dt>Buổi</dt><dd>{`${data.bookingCode ?? 'Lịch đặt'} · ${formatClosureSlot(data.startAt, data.endAt)}`}</dd></div>
        <div><dt>Người chăm sóc</dt><dd>{data.sitterName ?? 'Chưa rõ'}</dd></div>
        <div><dt>Check-in</dt><dd>{`${formatClosureTime(data.checkInAt)}, ${data.hasCheckInPhoto ? 'có ảnh check-in' : 'không có ảnh check-in'}`}</dd></div>
      </dl>
      <p className="visit-closure-dialog__notice"><CircleAlert size={17} aria-hidden="true" />
        <span>Buổi có ảnh check-in được tính là đã làm. Buổi không có ảnh check-in sẽ bị huỷ không tính phí và người chăm sóc không được trả công.</span>
      </p>
      {blocked && <p role="alert" className="visit-closure-dialog__error">{CLOSURE_NO_PHOTO_MESSAGE}</p>}
      <label>Lý do <span aria-hidden="true">*</span>
        <textarea value={reason} rows={4} maxLength={CLOSURE_REASON_MAX_LENGTH} disabled={busy || blocked}
          aria-required="true" aria-invalid={touched && missing ? 'true' : undefined}
          onChange={event => setReason(event.target.value)} />
      </label>
      {touched && missing && <p role="alert" className="visit-closure-dialog__error">Nhập lý do đóng buổi.</p>}
    </form>}
    {message && <p role="alert" className="visit-closure-dialog__error">{message}</p>}
  </Dialog>;
}
