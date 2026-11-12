import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { bookingMoney } from '../../utils/booking-presentation.js';
import { complaintDeadline, complaintError, complaintSubject, retryKey } from '../../utils/complaint-presentation.js';

const labels = { OPEN: 'Đang mở', RESOLVED: 'Đã có kết quả', ESCALATED: 'Chuyển quản trị', FINAL: 'Kết quả cuối' };

function ComplaintResultCard({ item, selected, serverNow, api, onUpdated }) {
  const card = useRef(null), operation = useRef(null), locked = useRef(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expiredDeadline, setExpiredDeadline] = useState(null);
  const deadline = Date.parse(item.objection?.deadlineAt);
  const deadlineText = complaintDeadline(item.objection?.deadlineAt);
  const serverTime = Date.parse(serverNow);
  const remaining = deadline - (Number.isFinite(serverTime) ? serverTime : Date.now());
  const expired = Number.isFinite(deadline) && (remaining <= 0 || expiredDeadline === deadline);
  const canDisagree = item.state === 'RESOLVED' && !item.isFinal && !expired && item.objection?.allowed === true;
  const state = item.isFinal || (item.state === 'RESOLVED' && expired) ? 'FINAL' : item.state;

  useEffect(() => {
    if (!canDisagree || !Number.isFinite(remaining)) return;
    const timer = globalThis.setTimeout(() => setExpiredDeadline(deadline), remaining);
    return () => globalThis.clearTimeout(timer);
  }, [canDisagree, deadline, remaining]);
  useEffect(() => {
    if (!selected || !card.current) return;
    card.current.focus({ preventScroll: true });
    card.current.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  async function disagree(event) {
    event.preventDefault();
    if (locked.current || !canDisagree) return;
    if (!reason.trim()) { setError('Trường này là bắt buộc.'); return; }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const payload = { complaintId: item.id, expectedVersion: item.version, reason: reason.trim() };
      const result = await api.disagree({ ...payload, idempotencyKey: retryKey(operation, payload) });
      if (result.pending) { setError('Đang chờ xác nhận. Hãy thử lại để kiểm tra.'); return; }
      onUpdated(result.data.complaint ?? result.data);
      setEditing(false);
      setReason('');
    } catch (failure) {
      setError(complaintError(failure, 'Không gửi được lý do. Hãy thử lại.'));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <article ref={card} tabIndex={selected ? -1 : undefined} aria-current={selected || undefined}
    aria-label={item.code ?? item.id} className="complaint-result">
    <header className="complaint-result__head">
      <h3>{item.code ?? item.id}</h3>
      <span className={'complaint-result__pill complaint-result__pill--' + state.toLowerCase()}>{labels[state] ?? 'Đang cập nhật'}</span>
    </header>
    <p className="complaint-result__subject">{complaintSubject(item)}</p>
    {item.customerResult && <p className="complaint-result__text">{item.customerResult}</p>}
    {Number.isSafeInteger(item.approvedAmountVnd) && <p>Khoản đã quyết: <strong>{bookingMoney(item.approvedAmountVnd)}</strong></p>}
    {state === 'ESCALATED' && <p>Quản trị viên đang xem lại kết quả.</p>}
    {canDisagree && deadlineText && <p className="complaint-result__deadline">Không đồng ý được đến {deadlineText}.</p>}
    {canDisagree && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Không đồng ý</Button>}
    {canDisagree && editing && <form className="complaint-objection" onSubmit={disagree} noValidate>
      <label>Lý do <span aria-hidden="true">*</span>
        <textarea value={reason} onChange={event => { setReason(event.target.value); setError(''); }}
          maxLength={4000} required disabled={busy} aria-invalid={Boolean(error)} />
      </label>
      {error && <p className="complaint-form-error" role="alert">{error}</p>}
      <div className="complaint-form-actions">
        <Button variant="secondary" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Hủy</Button>
        <Button type="submit" loading={busy}>Gửi lý do</Button>
      </div>
    </form>}
  </article>;
}

export function ComplaintResultList({ api, bookingId, selectedId, submitted }) {
  const list = useApiResource(useCallback(({ signal }) => api.list({ signal }), [api]));
  const focused = useApiResource(useCallback(({ signal }) => selectedId
    ? api.get({ complaintId: selectedId, signal }) : Promise.resolve({ data: null }), [api, selectedId]));
  const [pages, setPages] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [pagingError, setPagingError] = useState(false);
  const [paging, setPaging] = useState(false);
  const busy = useRef(false);
  const selected = focused.data?.bookingId === bookingId ? focused.data : null;
  const entries = [list.data?.items ?? [], ...pages.map(page => page.items),
    selected ? [selected] : [], submitted ? [submitted] : [], updates].flat();
  const byId = new Map();
  for (const item of entries) {
    if (!byId.has(item.id) || byId.get(item.id).version <= item.version) byId.set(item.id, item);
  }
  const items = [...byId.values()].sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id.localeCompare(a.id));
  const cursor = (pages.at(-1) ?? list.data)?.nextCursor;

  async function loadMore() {
    if (busy.current) return;
    busy.current = true;
    setPaging(true);
    setPagingError(false);
    try {
      const result = await api.list({ cursor });
      if (!result.data?.items) throw new Error('Invalid complaint list');
      setPages(previous => [...previous, result.data]);
    } catch {
      setPagingError(true);
    } finally {
      busy.current = false;
      setPaging(false);
    }
  }

  function update(item) {
    setUpdates(previous => [...previous.filter(existing => existing.id !== item.id), item]);
    setFeedback('Đã gửi lý do không đồng ý đến quản trị viên.');
  }

  return <section className="complaint-panel complaint-history" aria-labelledby="complaint-history-title">
    <h2 id="complaint-history-title">Khiếu nại của tôi</h2>
    {feedback && <Notice state="success" title={feedback} />}
    {selectedId && focused.status === 'loading' && <p role="status">Đang mở khiếu nại…</p>}
    {selectedId && (focused.status === 'error' || focused.status === 'forbidden' || (focused.status === 'success' && !selected)) &&
      <Notice state="error" title="Không mở được khiếu nại từ thông báo"
        action={<Button variant="secondary" onClick={focused.retry}>Thử lại</Button>} />}
    {list.status === 'loading' && <p role="status">Đang tải khiếu nại…</p>}
    {['error', 'forbidden', 'pending'].includes(list.status) && <Notice state="error" title="Chưa tải được khiếu nại"
      action={<Button variant="secondary" onClick={list.retry}>Thử lại</Button>} />}
    {list.status === 'success' && !items.length && <p>Bạn chưa gửi khiếu nại nào.</p>}
    {items.map(item => <ComplaintResultCard key={item.id} item={item} selected={selected?.id === item.id}
      serverNow={selected?.id === item.id ? focused.meta?.serverNow : list.meta?.serverNow} api={api} onUpdated={update} />)}
    {cursor && <Button variant="secondary" onClick={loadMore} loading={paging}>{pagingError ? 'Thử lại' : 'Xem thêm'}</Button>}
    {pagingError && <p role="alert" className="complaint-form-error">Chưa tải được khiếu nại tiếp theo.</p>}
  </section>;
}
