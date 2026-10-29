import { useEffect, useRef, useState } from 'react';
import { pendingAdminSettlementApi } from '../../services/admin-settlement-api.js';
import './admin-settlements.css';

function RequestCard({ row, api, disabled, refresh }) {
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE');
  const [outcome, setOutcome] = useState('CONFIRMED');
  const [reference, setReference] = useState('');
  const [evidence, setEvidence] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [amount, setAmount] = useState(String(row.amountVnd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const command = useRef(null);
  const lock = useRef(false);
  const submitted = row.status === 'SUBMITTED';
  const actionable = submitted || ['APPROVED', 'TRANSFER_PENDING'].includes(row.status);
  async function send(event) {
    event.preventDefault();
    if (lock.current) return;
    const body = submitted ? { decision, reason, expectedVersion: row.version }
      : { outcome, reference, evidenceReference: evidence, amountVnd: outcome === 'CONFIRMED' ? Number(amount) : undefined,
        paidAt: outcome === 'CONFIRMED' ? paidAt : undefined, expectedVersion: row.version };
    const payload = JSON.stringify(body);
    if (!command.current || command.current.payload !== payload) command.current = { payload, key: window.crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await api[submitted ? 'decide' : 'recordTransfer'](row.id, body, command.current.key);
      setNotice(result.status === 'PAID' ? 'Đã ghi nhận bằng chứng chuyển khoản.' : `Đã ghi nhận: ${result.status}.`);
      command.current = null; refresh();
    } catch (failure) { setError(failure.code || 'NETWORK_ERROR'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <article aria-label={`Yêu cầu ${row.id}`}>
    <h2>{row.id}</h2><p>Sitter {row.sitterId} · Tuần {row.requestWeekKey}</p>
    <p>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.amountVnd)} · {row.status}</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">Chưa xác nhận thao tác: {error}. Gửi lại cùng nội dung dùng lại mã yêu cầu.</p>}
    {actionable && <form onSubmit={send}>
      <fieldset disabled={busy || disabled}>
        <legend>{submitted ? 'Quyết định' : 'Ghi kết quả chuyển khoản ngoài hệ thống'}</legend>
        {submitted ? <>
          <label>Quyết định<select value={decision} onChange={event => setDecision(event.target.value)}><option value="APPROVE">Duyệt</option><option value="REJECT">Từ chối</option></select></label>
          <label>Lý do<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
        </> : <>
          <p>Chỉ ghi nhận giao dịch đã thực hiện. Duyệt chưa có nghĩa đã trả.</p>
          <label>Kết quả<select value={outcome} onChange={event => setOutcome(event.target.value)}><option value="CONFIRMED">Đã xác nhận</option><option value="UNKNOWN">Chưa rõ / cần đối soát</option></select></label>
          <label>Reference chuyển khoản<input required maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label>
          <label>Mã bằng chứng riêng tư<input required maxLength={160} value={evidence} onChange={event => setEvidence(event.target.value)} /></label>
          {outcome === 'CONFIRMED' && <>
            <label>Số tiền VND<input type="number" min="1" step="1" required value={amount} onChange={event => setAmount(event.target.value)} /></label>
            <label>Thời điểm có múi giờ (ISO, ví dụ 2026-10-15T10:00:00+07:00)<input required value={paidAt} onChange={event => setPaidAt(event.target.value)} /></label>
          </>}
        </>}
        <button type="submit">{busy ? 'Đang ghi nhận…' : submitted ? 'Lưu quyết định' : 'Ghi kết quả'}</button>
      </fieldset>
    </form>}
  </article>;
}

export default function AdminSettlementsPage({ api = pendingAdminSettlementApi }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null);
    api.load({ signal: controller.signal, cursor }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.code || 'NETWORK_ERROR'); });
    return () => controller.abort();
  }, [api, revision, cursor]);
  return <section className="admin-settlements">
    <h1>Duyệt tất toán</h1>
    <p>Xem yêu cầu theo tuần Việt Nam; không chuyển tiền tự động.</p>
    {error && <p role="alert">{error === 'FORBIDDEN' ? 'Bạn không có quyền xem payroll.' : error === 'INTEGRATION_PENDING' ? 'Đang chờ tích hợp payroll.' : `Không tải được: ${error}`}</p>}
    {!error && !data && <p role="status">Đang tải…</p>}
    <button type="button" onClick={() => setRevision(value => value + 1)}>Tải lại</button>
    {data && <>
      {!!data.decisionIds?.length && <p role="status">Chờ quyết định: {data.decisionIds.join(', ')}</p>}
      {!data.items.length && <p>Chưa có yêu cầu tất toán.</p>}
      {data.items.map(row => <RequestCard key={`${row.id}:${row.version}`} row={row} api={api}
        disabled={!Array.isArray(data.decisionIds) || !!data.decisionIds.length} refresh={() => setRevision(value => value + 1)} />)}
      {data.nextCursor && <button type="button" onClick={() => setCursor(data.nextCursor)}>Trang tiếp</button>}
      {cursor && <button type="button" onClick={() => setCursor(null)}>Trang đầu</button>}
    </>}
  </section>;
}
