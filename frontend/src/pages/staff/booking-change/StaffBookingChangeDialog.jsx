import { useCallback, useRef, useState } from 'react';
import { Button, Dialog } from '../../../components/ui/index.js';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { apiErrorFeedback } from '../../../utils/api-error-feedback.js';
import { staffBookingChangeAvailability, staffBookingChangeStates, staffChangeDecisionError, staffChangeMoment,
  staffChangePrice, staffChangeRange, staffChangeScope } from '../../../utils/staff-booking-change-format.js';
import './staff-booking-change.css';

const uncertainCodes = new Set(['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE']);

function ChangeTimes({ items, updated }) {
  if (!items.length) return '—';
  return <ul className="staff-change-times">{items.map(item => <li key={item.visitId}>
    {updated ? staffChangeRange(item.newStartAt, item.newEndAt) : staffChangeRange(item.oldStartAt, item.oldEndAt)}
  </li>)}</ul>;
}

function SitterAvailability({ items }) {
  if (!items.some(item => item.availability)) return null;
  return <section className="staff-change-sitters">
    <h3>Người chăm sóc ở giờ mới</h3>
    {items.map(item => <div key={item.visitId} className="staff-change-sitter">
      {items.length > 1 && <p>{staffChangeRange(item.newStartAt, item.newEndAt)}</p>}
      <div className="staff-change-sitter-row">
        <strong>{item.sitterName ?? 'Chưa có người chăm sóc'}</strong>
        <span className="staff-change-pill" data-state={item.availability}>
          {staffBookingChangeAvailability[item.availability] ?? 'Chưa xác định'}
        </span>
      </div>
    </div>)}
    <p>{items.length === 1 && items[0].availability === 'AVAILABLE' && items[0].sitterName
      ? 'Nếu duyệt, ' + items[0].sitterName + ' giữ buổi ở giờ mới.'
      : 'Nếu duyệt, người chăm sóc rảnh giữ buổi ở giờ mới.'}
      {' '}Người chăm sóc bận giờ mới thì buổi được mời người khác.</p>
  </section>;
}

export function StaffBookingChangeDialog({ api, requestId, onClose, onDecision }) {
  const load = useCallback(({ signal }) => api.detail(requestId, { signal }), [api, requestId]);
  const resource = useApiResource(load);
  const detail = resource.data;
  const operation = useRef(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [failure, setFailure] = useState(null);
  const terminal = failure?.code === 'BOOKING_CHANGE_NOT_PENDING';
  const state = terminal ? (staffBookingChangeStates[failure.state] ? failure.state : 'CLOSED') : detail?.state;
  const pending = state === 'PENDING';
  const conflict = failure?.code === 'VERSION_CONFLICT';
  const changed = failure?.code === 'BOOKING_CHANGE_VISIT_CHANGED' || detail?.items.some(item => item.availability === 'CHANGED');
  const locked = busy || uncertain;

  async function send() {
    if (!operation.current || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const { data } = await api.decide(requestId, operation.current.body, operation.current.key);
      operation.current = null;
      onDecision(data);
    } catch (error) {
      const unknown = error.status >= 500 || uncertainCodes.has(error.code);
      setUncertain(unknown);
      if (!unknown) {
        operation.current = null;
        setFailure(error);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function decide(action) {
    if (!pending || conflict || locked || inFlight.current || action === 'APPROVE' && changed) return;
    operation.current = { body: { action, expectedVersion: detail.version }, key: 'booking-change:' + globalThis.crypto.randomUUID() };
    void send();
  }

  function reload() {
    setFailure(null);
    resource.retry();
  }

  return <Dialog open title="Yêu cầu đổi giờ" onClose={() => onClose(terminal || Boolean(detail && !pending))} dismissible={!locked}
    className="staff-change-dialog" footer={uncertain
      ? <Button loading={busy} onClick={send}>Kiểm tra lại yêu cầu</Button>
      : pending && !conflict ? <>
        <Button variant="secondary" disabled={busy} onClick={() => decide('REJECT')}>Từ chối</Button>
        <Button loading={busy} disabled={changed} onClick={() => decide('APPROVE')}>Duyệt</Button>
      </> : conflict ? <Button onClick={reload}>Tải lại yêu cầu</Button>
        : <Button variant="secondary" onClick={() => onClose(terminal || Boolean(detail && !pending))}>Quay lại</Button>}>
    {resource.status === 'loading' && <p role="status">Đang tải yêu cầu đổi giờ…</p>}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <p role="alert">
      {apiErrorFeedback({ status: resource.httpStatus, code: resource.code })}{' '}
      <Button variant="secondary" onClick={reload}>Thử lại</Button>
    </p>}
    {detail && <>
      <span className="staff-change-pill staff-change-status" data-state={state}>{staffBookingChangeStates[state]}</span>
      <p className="staff-change-summary">{detail.bookingCode ?? 'Lịch đặt'} · {detail.customerName ?? 'Khách hàng'} · gửi lúc {staffChangeMoment(detail.sentAt)}</p>
      <dl className="staff-change-facts">
        <div><dt>Đổi cho</dt><dd>{staffChangeScope(detail.scope)}</dd></div>
        <div><dt>Giờ cũ</dt><dd><ChangeTimes items={detail.items} /></dd></div>
        <div><dt>Giờ mới</dt><dd><ChangeTimes items={detail.items} updated /></dd></div>
        <div><dt>Giá</dt><dd>{staffChangePrice(detail.items)}</dd></div>
      </dl>
      {pending && <SitterAvailability items={detail.items} />}
      <p className="staff-change-deadline">Hết hạn lúc {staffChangeMoment(detail.expiresAt)} (6 giờ trước giờ cũ hoặc giờ mới, giờ nào đến trước). Hết hạn thì buổi giữ giờ cũ.</p>
    </>}
    {uncertain && <p className="staff-change-error" role="alert">Chưa nhận được xác nhận. Hãy kiểm tra lại cùng yêu cầu.</p>}
    {!uncertain && (failure || changed && pending) && <p className="staff-change-error" role="alert">
      {staffChangeDecisionError(failure ?? { code: 'BOOKING_CHANGE_VISIT_CHANGED' })}
    </p>}
  </Dialog>;
}
