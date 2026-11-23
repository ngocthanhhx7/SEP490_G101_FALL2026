import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { OperationsBadge } from '../../components/common/OperationsWorkspace.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { formatWithdrawalDate as date, formatWithdrawalTime as time } from '../../constants/visit-withdrawal-messages.js';
import { productMessage } from '../../utils/product-format.js';
import { dispatchReason } from '../../utils/dispatch-format.js';
import { REASON_LABELS, formatDuration, formatReasonTime } from '../../utils/visit-board-format.js';
import { formatBookingRef } from '../../utils/visit-closure-format.js';
import { sitterLabel } from '../../utils/sitter-management-format.js';
import { ContactCell } from './visit-board/ContactCell.jsx';
import { DispatchBlockedSection, DispatchCandidateOptions } from './DispatchCandidateList.jsx';
import './visit-board/visit-board.css';
import './staff-reassign.css';

const REASON_MAX = 1000, BACK = '/staff/dispatch';
const EXTRA_REASONS = { SITTER_WITHDREW: 'Đã rút khỏi buổi này' };
const reasonText = code => EXTRA_REASONS[code] ?? dispatchReason(code);
const interval = row => `${date(row.startAt)} · ${time(row.startAt)} – ${time(row.endAt)}`;

function Detail({ label, children }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function CurrentSitter({ sitter, visitId, api }) {
  return <div className="staff-reassign__current">
    <div>
      <p className="staff-reassign__current-label">Người chăm sóc hiện tại</p>
      <strong>{sitter.displayName ?? 'Người chăm sóc'}</strong>
      {sitter.employmentType && <span> · {sitterLabel(sitter.employmentType)}</span>}
      {sitter.assignedAt && <small>Đã nhận buổi lúc {time(sitter.assignedAt)} ngày {date(sitter.assignedAt).slice(0, 5)}</small>}
    </div>
    <div className="staff-reassign__call"><ContactCell row={{ id: visitId }} label={`Gọi ${sitter.displayName ?? 'người chăm sóc'}`} party="sitter" api={api} /></div>
  </div>;
}

function VisitCard({ data, api }) {
  const { visit, currentSitter } = data, [main] = visit.reasons ?? [];
  return <section className="staff-reassign__card" aria-labelledby="staff-reassign-visit">
    <h2 id="staff-reassign-visit">Buổi cần đổi người</h2>
    <dl className="staff-reassign__details">
      <Detail label="Lịch đặt">{formatBookingRef(visit)}{visit.serviceName && ` · ${visit.serviceName}`}</Detail>
      <Detail label="Khách hàng">{visit.customerName ?? 'Chưa có tên'}</Detail>
      <Detail label="Buổi">{interval(visit)}</Detail>
      <Detail label="Địa chỉ">{visit.address ?? 'Chưa có địa chỉ'}</Detail>
      <Detail label="Thú cưng">{visit.pets.length ? visit.pets.map(pet => pet.species ? `${pet.name ?? 'Thú cưng'} (${sitterLabel(pet.species)})` : pet.name ?? 'Thú cưng').join(', ') : 'Chưa có'}</Detail>
      <Detail label="Lý do">{main ? <><OperationsBadge tone={main.late ? 'danger' : 'warning'}>{REASON_LABELS[main.code] ?? 'Cần xử lý'}</OperationsBadge> <span className={main.late ? 'visit-board__late' : undefined}>{formatReasonTime(main)}</span></> : 'Chưa có lý do cần xử lý'}</Detail>
    </dl>
    <CurrentSitter sitter={currentSitter} visitId={visit.id} api={api} />
  </section>;
}

export function StaffReassignPage({ api, visitId }) {
  const navigate = useNavigate(), { state } = useLocation(), backTo = typeof state?.returnTo === 'string' && state.returnTo.startsWith(BACK) ? state.returnTo : BACK;
  const reasonId = useId(), errorId = `${reasonId}-error`, field = useRef(null);
  const load = useCallback(({ signal }) => api.reassignment(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load), [kept, setKept] = useState(null);
  useEffect(() => { if (resource.data) setKept(resource.data); }, [resource.data]);
  // While the page reloads after a refusal, the last list stays in place so the message and the form do not jump.
  const data = resource.data ?? (resource.status === 'loading' ? kept : null);
  const [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [blank, setBlank] = useState(false);
  const [notice, setNotice] = useState(null), [listNotice, setListNotice] = useState(''), [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false), operation = useRef(null);
  useEffect(() => { setSelected(value => data?.items.some(item => item.sitterId === value) ? value : ''); }, [data]);
  const name = id => [...(data?.items ?? []), ...(data?.blocked ?? [])].find(item => item.sitterId === id)?.displayName ?? 'Người chăm sóc';

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!reason.trim()) { setBlank(true); field.current?.focus(); return; }
    if (!selected) return;
    const body = { expectedVersion: data.visit.version, sitterId: selected, reason: reason.trim() };
    // A retry after an unconfirmed answer repeats the same operation key; a changed choice starts a new operation.
    if (operation.current?.fingerprint !== JSON.stringify(body)) operation.current = { fingerprint: JSON.stringify(body), key: `reassign:${globalThis.crypto.randomUUID()}` };
    setBusy(true); setProblem(''); setListNotice(''); setNotice(null);
    try {
      const result = await api.reassign(visitId, body, operation.current.key);
      if (result.pending || result.status === 202) { setProblem('Đang chờ xác nhận. Bấm lại để kiểm tra cùng yêu cầu.'); return; }
      operation.current = null;
      navigate(backTo, { state: { reassigned: productMessage('MSG92', { name: result.data.sitterName ?? name(selected), date: date(result.data.startAt), time: time(result.data.startAt) }) } });
    } catch (error) {
      const uncertain = !error.status || error.status >= 500 || ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE'].includes(error.code);
      if (!uncertain) operation.current = null;
      if (error.code === 'REASSIGN_VISIT_CHANGED') {
        setNotice(error.sitterName ? productMessage('MSG25', { name: error.sitterName }) : 'Buổi này vừa thay đổi. Trang đã cập nhật thông tin mới nhất.');
        setSelected(''); resource.retry();
      } else if (error.code === 'REASSIGN_SITTER_NOT_ELIGIBLE') {
        setListNotice(productMessage('MSG45', { name: error.sitterName ?? name(selected), reason: reasonText(error.reasonCode) })); setSelected(''); resource.retry();
      } else if (error.code === 'REASSIGN_SITTER_BUSY') {
        setListNotice(productMessage('MSG46', { name: error.sitterName ?? name(selected) })); setSelected(''); resource.retry();
      } else if (error.code === 'REASON_REQUIRED') { setBlank(true); field.current?.focus(); }
      else setProblem(uncertain ? 'Chưa nhận được xác nhận. Bấm lại để kiểm tra cùng yêu cầu.' : 'Chưa đổi được người chăm sóc. Tải lại danh sách rồi thử lại.');
    } finally { setBusy(false); }
  }

  const gone = resource.status === 'error' && [404, 409].includes(resource.httpStatus);
  return <section className="ops-workspace staff-reassign">
    <Link className="staff-reassign__back" to={backTo}>← Quay lại Điều phối ca</Link>
    <header>
      <h1>Đổi người chăm sóc</h1>
      <p className="ops-muted">Thay người chăm sóc của một buổi. Chỉ chọn được người qua đủ kiểm tra như lời mời tự động.</p>
    </header>
    {notice && <Notice state="error" title="Buổi đã thay đổi">{notice}</Notice>}
    {resource.status === 'loading' && !data && <p role="status">Đang tải buổi cần đổi người…</p>}
    {gone && <Notice state="empty" title="Buổi này không còn đổi người được."><Link to={backTo}>Về Điều phối ca</Link></Notice>}
    {resource.status === 'error' && !gone && <Notice state="error" title="Chưa tải được buổi." action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>
      {resource.httpStatus === 429 ? 'Đã kiểm tra nhiều lần. Chờ một phút rồi tải lại.' : null}</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Chỉ nhân viên hoặc quản trị mới đổi được người chăm sóc." />}
    {data && <form onSubmit={submit} noValidate>
      <VisitCard data={data} api={api} />
      <section className="staff-reassign__card dispatch-picker" aria-labelledby="staff-reassign-pick">
        <h2 id="staff-reassign-pick">Chọn người thay</h2>
        {data.items.length > 0 && <DispatchCandidateOptions items={data.items} selected={selected} disabled={busy} onSelect={id => { setSelected(id); setListNotice(''); }} name="reassign-sitter"
          meta={item => <>{item.employmentType && `${sitterLabel(item.employmentType)} · `}Tuần này đã làm {formatDuration((item.weeklyMinutes ?? 0) * 60000)} · <OperationsBadge tone="success">Nhận được</OperationsBadge></>} />}
        {data.items.length === 0 && <Notice state="warning" title="Chưa có người chăm sóc nào nhận được buổi này.">Có thể huỷ buổi không tính phí ở Điều phối ca.</Notice>}
        {data.blocked.length > 0 && <DispatchBlockedSection blocked={data.blocked} selected={selected} prefix="/staff" radios />}
        {listNotice && <p role="alert" className="staff-reassign__error">{listNotice}</p>}
        <div className="staff-reassign__reason">
          <label htmlFor={reasonId}>Lý do đổi người <span aria-hidden="true">*</span></label>
          <textarea id={reasonId} ref={field} value={reason} maxLength={REASON_MAX} rows={3} required aria-required="true" aria-invalid={blank || undefined} aria-describedby={blank ? errorId : undefined}
            disabled={busy} onChange={event => { setReason(event.target.value); if (event.target.value.trim()) setBlank(false); }} />
          {blank && <p id={errorId} role="alert" className="staff-reassign__error">{productMessage('MSG01')}</p>}
          <small className="ops-muted">{reason.length}/{REASON_MAX}</small>
        </div>
        <Notice state="warning" title="Ghi chú">Khách và cả hai người chăm sóc được báo. Người mới phải xác nhận bàn giao trước buổi ít nhất 1 giờ, hoặc ngay trước khi check-in nếu buổi được giao khi còn chưa đầy 1 giờ. Ghi chú bàn giao có lý do, người trước và giờ chuyển.</Notice>
        {problem && <p role="alert" className="staff-reassign__error">{problem}</p>}
        <div className="staff-reassign__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => navigate(backTo)}>Quay lại</Button>
          <Button type="submit" disabled={!selected || busy}>{busy ? 'Đang đổi người…' : 'Đổi người chăm sóc'}</Button>
        </div>
      </section>
    </form>}
  </section>;
}
