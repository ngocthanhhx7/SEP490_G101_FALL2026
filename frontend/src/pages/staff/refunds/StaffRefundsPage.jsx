import { useRef, useState } from 'react';
import { Button, Input, Notice } from '../../../components/ui/index.js';
import '../../financial/refunds.css';

const DECISION_IDS = ['FIN-02-ALLOC', 'FIN-02-ROUND', 'FIN-06-CAUSE', 'FIN-07-POSTPAY'];

function messageForError(error) {
  if (error?.code === 'DECISION_REQUIRED') {
    const ids = Array.isArray(error.decisionIds) ? error.decisionIds : DECISION_IDS;
    return `Chưa thể xác định khoản hoàn. Cần chốt: ${ids.join(', ')}.`;
  }
  if (error?.code === 'REFUND_LIMIT_EXCEEDED') return 'Số tiền đề xuất vượt quá khoản đã thu còn có thể hoàn.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return 'Chưa nhận được xác nhận từ máy chủ. Gửi lại cùng yêu cầu để đối chiếu kết quả.';
  }
  if (error?.code === 'FORBIDDEN') return 'Bạn không có quyền tạo đề xuất hoàn tiền cho hồ sơ này.';
  return 'Không thể tạo đề xuất lúc này. Hãy kiểm tra thông tin và thử lại.';
}

function makeKey() {
  return window.crypto.randomUUID();
}

export function StaffRefundsPage({ canPropose = false, api, createIdempotencyKey = makeKey,
  integrationPending = !api }) {
  const [sourceType, setSourceType] = useState('CANCELLATION');
  const [sourceId, setSourceId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const keyRef = useRef(null);

  function clearKey() {
    keyRef.current = null;
  }

  async function submit(event) {
    event.preventDefault();
    setNotice(null);
    const amountVnd = Number(amountText);
    if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
      setNotice({ state: 'error', text: 'Nhập số tiền VND là số nguyên dương.' });
      return;
    }
    const payload = { sourceRef: { type: sourceType, id: sourceId.trim() }, amountVnd, reason: reason.trim() };
    if (!payload.sourceRef.id || !payload.reason) {
      setNotice({ state: 'error', text: 'Nhập mã hồ sơ và lý do đề xuất.' });
      return;
    }
    if (!api || integrationPending) {
      setNotice({ state: 'pending', text: 'API hoàn tiền chưa được tích hợp. Chưa có đề xuất nào được lưu.' });
      return;
    }
    const fingerprint = JSON.stringify(payload);
    if (keyRef.current?.fingerprint !== fingerprint) {
      keyRef.current = { fingerprint, key: createIdempotencyKey() };
    }
    setBusy(true);
    try {
      await api.propose(payload, { idempotencyKey: keyRef.current.key });
      clearKey();
      setNotice({ state: 'pending', text: 'Đề xuất đã được gửi để Admin xem xét. Đây chưa phải xác nhận đã hoàn tiền.' });
      setAmountText('');
      setReason('');
    } catch (error) {
      setNotice({ state: error?.code === 'FORBIDDEN' ? 'forbidden' : 'error', text: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!canPropose) {
    return <main className="refund-page"><h1>Đề xuất hoàn tiền</h1>
      <Notice state="forbidden" title="Không có quyền truy cập">Chỉ Staff được phân quyền hoặc Admin mới có thể đề xuất.</Notice>
    </main>;
  }

  return <main className="refund-page">
    <header className="refund-page__header">
      <p className="refund-page__eyebrow">Tài chính · Staff</p>
      <h1>Đề xuất hoàn tiền</h1>
      <p>Gửi yêu cầu để Admin xem xét. Chỉ số tiền đã thu ròng còn lại mới đủ điều kiện hoàn.</p>
    </header>

    <Notice state="pending" title="Đề xuất chưa phải khoản đã chuyển">
      Backend đối chiếu số tiền đã thu và các điều chỉnh trước đó. Các khoản tính phụ thuộc FIN-02-ALLOC, FIN-02-ROUND, FIN-06-CAUSE hoặc FIN-07-POSTPAY sẽ bị chặn đến khi có quyết định.
    </Notice>
    {integrationPending && <Notice state="pending" title="Đang chờ tích hợp">
      Biểu mẫu chưa nối với API hoàn tiền. Không có dữ liệu mẫu hoặc giao dịch thật được tạo từ trang này.
    </Notice>}

    <form className="refund-form" onSubmit={submit} noValidate>
      <fieldset disabled={busy || integrationPending || !api}>
        <legend>Thông tin đề xuất</legend>
        <label className="refund-field">
          <span>Loại hồ sơ</span>
          <select value={sourceType} onChange={event => setSourceType(event.target.value)}>
            <option value="CANCELLATION">Hủy dịch vụ</option>
            <option value="CASE">Hồ sơ sự cố</option>
            <option value="ADJUSTMENT">Điều chỉnh tài chính</option>
          </select>
        </label>
        <Input label="Mã hồ sơ" value={sourceId} onChange={event => setSourceId(event.target.value)}
          autoComplete="off" maxLength={128} required hint="Chỉ nhập mã tham chiếu, không nhập thông tin tài khoản ngân hàng." />
        <Input label="Số tiền đề xuất (VND)" type="number" inputMode="numeric" min="1" step="1"
          value={amountText} onChange={event => setAmountText(event.target.value)} required />
        <label className="refund-field">
          <span>Lý do</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500}
            rows="4" required />
        </label>
        <Button type="submit" loading={busy} loadingLabel="Đang gửi…">Gửi đề xuất</Button>
      </fieldset>
    </form>
    {notice && <Notice state={notice.state} title={notice.state === 'pending' ? 'Đang chờ xử lý' : 'Không thể gửi'}>
      {notice.text}
    </Notice>}
  </main>;
}
