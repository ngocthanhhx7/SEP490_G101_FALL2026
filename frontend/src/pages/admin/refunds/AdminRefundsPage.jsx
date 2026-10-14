import { useEffect, useRef, useState } from 'react';
import { Button, Input, Notice } from '../../../components/ui/index.js';
import '../../financial/refunds.css';

const STATUS_LABELS = {
  PROPOSED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt · chưa chuyển',
  TRANSFER_PENDING: 'Đang chờ đối soát',
  PAID: 'Đã ghi nhận đã chuyển',
  FAILED: 'Chuyển thất bại',
  REJECTED: 'Đã từ chối'
};

function messageForError(error) {
  if (error?.code === 'DECISION_REQUIRED') {
    const ids = Array.isArray(error.decisionIds) ? error.decisionIds : [];
    return `Chưa thể duyệt vì còn quyết định tài chính mở${ids.length ? `: ${ids.join(', ')}` : ''}.`;
  }
  if (error?.code === 'REFUND_LIMIT_EXCEEDED') return 'Số tiền vượt khoản đã thu ròng còn lại; yêu cầu chưa được duyệt.';
  if (error?.code === 'VERSION_CONFLICT') return 'Hồ sơ đã được cập nhật ở nơi khác. Tải lại trước khi thao tác.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return 'Chưa nhận được xác nhận từ máy chủ. Gửi lại cùng yêu cầu để đối chiếu kết quả.';
  }
  if (error?.code === 'FORBIDDEN') return 'Bạn không có quyền thực hiện thao tác này.';
  return 'Không thể cập nhật hồ sơ lúc này. Trạng thái chuyển tiền chưa được xác nhận.';
}

function formatVnd(value) {
  if (!Number.isSafeInteger(value) || value < 0) return 'Không xác định';
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

function formatVietnamDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

function vietnamTimestamp(value) {
  if (!value) return undefined;
  const parsed = new Date(`${value}+07:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function makeKey() {
  return window.crypto.randomUUID();
}

function RefundReviewCard({ refund, api, createIdempotencyKey, onChanged }) {
  const [decisionReason, setDecisionReason] = useState('');
  const [outcome, setOutcome] = useState('UNKNOWN');
  const [amountText, setAmountText] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const commandRef = useRef(null);
  const enabled = Boolean(api) && !busy;

  function keyFor(operation, payload) {
    const fingerprint = JSON.stringify({ operation, payload });
    if (commandRef.current?.fingerprint !== fingerprint) {
      commandRef.current = { fingerprint, key: createIdempotencyKey() };
    }
    return commandRef.current.key;
  }

  async function decide(decision) {
    setNotice(null);
    const reason = decisionReason.trim();
    if (!reason) {
      setNotice({ state: 'error', text: 'Nhập lý do duyệt hoặc từ chối để lưu dấu vết kiểm toán.' });
      return;
    }
    const command = { decision, reason, expectedVersion: refund.version };
    if (!api) {
      setNotice({ state: 'pending', text: 'API chưa được tích hợp; hồ sơ chưa thay đổi.' });
      return;
    }
    setBusy(true);
    try {
      const response = await api.decide(refund.id, command,
        { idempotencyKey: keyFor('decision', command) });
      commandRef.current = null;
      const updated = response?.data ?? response;
      onChanged(updated);
      setNotice({ state: 'success', text: updated.status === 'APPROVED'
        ? 'Đã duyệt và giữ khoản hoàn. Chưa có xác nhận chuyển tiền.' : 'Đề xuất đã bị từ chối.' });
    } catch (error) {
      setNotice({ state: error?.code === 'FORBIDDEN' ? 'forbidden' : 'error', text: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function recordTransfer(event) {
    event.preventDefault();
    setNotice(null);
    const command = { outcome, expectedVersion: refund.version };
    if (amountText.trim()) {
      const amountVnd = Number(amountText);
      if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
        setNotice({ state: 'error', text: 'Số tiền chuyển phải là số nguyên VND dương.' });
        return;
      }
      command.amountVnd = amountVnd;
    }
    if (transferReference.trim()) command.transferReference = transferReference.trim();
    if (evidenceReference.trim()) command.evidenceReference = evidenceReference.trim();
    if (outcome === 'CONFIRMED') {
      const timestamp = vietnamTimestamp(paidAt);
      if (!command.amountVnd || !command.transferReference || !command.evidenceReference || !timestamp) {
        setNotice({ state: 'error', text: 'Xác nhận đã chuyển cần đủ số tiền, mã giao dịch, mã chứng từ và thời điểm giờ Việt Nam.' });
        return;
      }
      command.paidAt = timestamp;
    }
    if (outcome === 'FAILED' && !command.evidenceReference) {
      setNotice({ state: 'error', text: 'Chuyển thất bại cần mã chứng từ xác minh.' });
      return;
    }
    if (!api) {
      setNotice({ state: 'pending', text: 'API chưa được tích hợp; trạng thái vẫn chưa xác nhận.' });
      return;
    }
    setBusy(true);
    try {
      const response = await api.recordTransfer(refund.id, command,
        { idempotencyKey: keyFor('transfer', command) });
      commandRef.current = null;
      const updated = response?.data ?? response;
      onChanged(updated);
      setNotice({ state: updated.status === 'PAID' ? 'success' : 'pending',
        text: updated.status === 'PAID' ? 'Đã ghi nhận khoản chuyển có chứng từ.'
          : updated.status === 'FAILED' ? 'Đã ghi nhận chuyển thất bại; khoản giữ đã được giải phóng.'
            : 'Kết quả chuyển tiền chưa rõ. Khoản giữ vẫn được bảo toàn để đối soát.' });
    } catch (error) {
      setNotice({ state: error?.code === 'FORBIDDEN' ? 'forbidden' : 'error', text: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  const canDecide = refund.status === 'PROPOSED';
  const canRecordTransfer = ['APPROVED', 'TRANSFER_PENDING'].includes(refund.status);
  return <article className="refund-card">
    <div className="refund-card__heading">
      <div><h2>{refund.sourceRef?.type === 'CANCELLATION' ? 'Hủy dịch vụ'
        : refund.sourceRef?.type === 'CASE' ? 'Hồ sơ sự cố' : 'Điều chỉnh tài chính'}</h2>
        <p>Mã hồ sơ: <code>{refund.sourceRef?.id || '—'}</code></p>
      </div>
      <span className={`refund-status refund-status--${String(refund.status).toLowerCase()}`}>
        {STATUS_LABELS[refund.status] || 'Trạng thái chưa xác định'}
      </span>
    </div>
    <dl className="refund-card__facts">
      <div><dt>Số tiền đề xuất</dt><dd>{formatVnd(refund.amountVnd)}</dd></div>
      <div><dt>Tạo lúc (giờ Việt Nam)</dt><dd>{formatVietnamDate(refund.createdAt)}</dd></div>
      <div><dt>Mã yêu cầu</dt><dd><code>{refund.id}</code></dd></div>
    </dl>
    {refund.reason && <p className="refund-card__reason">{refund.reason}</p>}

    {canDecide && <section className="refund-card__section" aria-label={`Duyệt đề xuất ${refund.id}`}>
      <label className="refund-field"><span>Lý do quyết định</span>
        <textarea value={decisionReason} onChange={event => setDecisionReason(event.target.value)} rows="3" maxLength={500} />
      </label>
      <div className="refund-actions">
        <Button disabled={!enabled} loading={busy} onClick={() => decide('APPROVE')}>Duyệt và giữ khoản hoàn</Button>
        <Button variant="secondary" disabled={!enabled} loading={busy} onClick={() => decide('REJECT')}>Từ chối</Button>
      </div>
    </section>}

    {canRecordTransfer && <form className="refund-card__section refund-transfer-form" onSubmit={recordTransfer}>
      <h3>Ghi nhận chuyển khoản thủ công</h3>
      <p>Trang này không gửi tiền. Chỉ chọn “Đã xác nhận” sau khi đối chiếu chứng từ ngoài hệ thống.</p>
      <label className="refund-field"><span>Kết quả đối soát</span>
        <select value={outcome} onChange={event => setOutcome(event.target.value)}>
          <option value="UNKNOWN">Chưa rõ · giữ khoản hoàn</option>
          <option value="CONFIRMED">Đã chuyển và đã đối chiếu</option>
          <option value="FAILED">Xác nhận chuyển thất bại</option>
        </select>
      </label>
      <Input label="Số tiền chuyển (VND)" type="number" inputMode="numeric" min="1" step="1"
        value={amountText} onChange={event => setAmountText(event.target.value)} />
      <Input label="Mã giao dịch" value={transferReference} maxLength={160}
        onChange={event => setTransferReference(event.target.value)} autoComplete="off" />
      <Input label="Mã chứng từ" value={evidenceReference} maxLength={160}
        onChange={event => setEvidenceReference(event.target.value)} autoComplete="off" />
      {outcome === 'CONFIRMED' && <Input label="Thời điểm chuyển (giờ Việt Nam)" type="datetime-local"
        value={paidAt} onChange={event => setPaidAt(event.target.value)} required />}
      <Button type="submit" disabled={!enabled} loading={busy} loadingLabel="Đang lưu…">Lưu kết quả đối soát</Button>
    </form>}
    {notice && <Notice state={notice.state} title={notice.state === 'success' ? 'Đã cập nhật'
      : notice.state === 'pending' ? 'Đang chờ đối soát' : 'Không thể cập nhật'}>{notice.text}</Notice>}
  </article>;
}

export function AdminRefundsPage({ canReview = false, refunds = [], loadState = 'pending', error,
  api, createIdempotencyKey = makeKey, integrationPending = !api }) {
  const [items, setItems] = useState(refunds);
  useEffect(() => setItems(refunds), [refunds]);

  function replace(updated) {
    if (!updated?.id) return;
    setItems(current => current.map(item => item.id === updated.id ? updated : item));
  }

  if (!canReview) return <main className="refund-page"><h1>Hoàn tiền & điều chỉnh</h1>
    <Notice state="forbidden" title="Không có quyền truy cập">Chỉ Admin được phép duyệt đề xuất và ghi nhận chuyển tiền.</Notice>
  </main>;

  return <main className="refund-page">
    <header className="refund-page__header">
      <p className="refund-page__eyebrow">Tài chính · Admin</p>
      <h1>Hoàn tiền & điều chỉnh</h1>
      <p>Phê duyệt chỉ giữ khoản hoàn. Trạng thái “đã chuyển” cần chứng từ đối soát được ghi nhận.</p>
    </header>
    <Notice state="pending" title="Giới hạn phê duyệt">
      Mỗi yêu cầu phải nằm trong khoản đã thu ròng còn lại sau các điều chỉnh trước đó. Quyết định còn mở sẽ chặn duyệt; không tự tính tỷ lệ giữ hoặc làm tròn.
    </Notice>
    {integrationPending && <Notice state="pending" title="Đang chờ tích hợp">
      API đọc và ghi quyết định chưa được nối. Không có khoản hoàn mẫu nào được trình bày như giao dịch thật.
    </Notice>}
    {loadState === 'forbidden' && <Notice state="forbidden" title="Không có quyền truy cập">Máy chủ từ chối quyền xem các đề xuất này.</Notice>}
    {loadState === 'error' && <Notice state="error" title="Không tải được đề xuất">{error || 'Thử tải lại sau.'}</Notice>}
    {loadState === 'loading' && <Notice state="loading" title="Đang tải đề xuất">Đang đọc trạng thái từ máy chủ.</Notice>}
    {loadState === 'pending' && !integrationPending && <Notice state="pending" title="Đang chờ dữ liệu">Nguồn dữ liệu đề xuất chưa trả kết quả.</Notice>}
    {loadState === 'success' && items.length === 0 && <Notice state="empty" title="Chưa có đề xuất">Các yêu cầu hoàn tiền sẽ xuất hiện tại đây.</Notice>}
    {loadState === 'success' && items.length > 0 && <section className="refund-list" aria-label="Danh sách đề xuất hoàn tiền">
      {items.map(refund => <RefundReviewCard key={refund.id} refund={refund} api={integrationPending ? null : api}
        createIdempotencyKey={createIdempotencyKey} onChanged={replace} />)}
    </section>}
  </main>;
}
