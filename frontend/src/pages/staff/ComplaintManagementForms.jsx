import { useRef, useState } from 'react';
import { Button } from '../../components/ui/index.js';
import { PRIVATE_IMAGE_MAX_BYTES } from '../../services/private-image-api.js';
import { bookingMoney } from '../../utils/booking-presentation.js';
import { complaintError, retryKey, uncertainComplaint } from '../../utils/complaint-presentation.js';

const required = 'Trường này là bắt buộc.';
const missingBilling = 'Chưa có nguồn hóa đơn để xác nhận số tiền.';
const imageTypes = ['image/png', 'image/jpeg'];

function amountError(raw, value, cap, finalDecision) {
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || (!finalDecision && value === 0)) {
    return 'Nhập số nguyên đồng' + (finalDecision ? '.' : ' lớn hơn 0.');
  }
  if (value > cap) return 'Số tiền không được vượt quá ' + bookingMoney(cap) + ' còn lại của hóa đơn.';
  return null;
}

function FieldError({ id, message }) {
  return message ? <p className="complaint-management__error" id={id} role="alert">{message}</p> : null;
}

export function ComplaintManagementForm({ api, imageApi, item, finalDecision = false, onComplete }) {
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [billingBlocked, setBillingBlocked] = useState(false);
  const pending = useRef(null), locked = useRef(false);
  const billing = item.billing, cap = billing?.remainingVnd;
  const canUseMoney = !billingBlocked && billing?.status === 'AVAILABLE' && Number.isSafeInteger(cap) && cap >= 0;
  const hasAmount = canUseMoney && Boolean(amount.trim());
  const reasonRequired = hasAmount && !finalDecision;

  function chooseFiles(event) {
    const selected = [...event.target.files];
    event.target.value = '';
    if (files.length + selected.length > 20) {
      setErrors(previous => ({ ...previous, evidenceRefs: 'Bạn có thể thêm tối đa 20 ảnh.' }));
      return;
    }
    if (selected.some(file => !imageTypes.includes(file.type) || file.size < 1 || file.size > PRIVATE_IMAGE_MAX_BYTES)) {
      setErrors(previous => ({ ...previous, evidenceRefs: 'Chọn ảnh PNG hoặc JPEG không quá 5 MB.' }));
      return;
    }
    setErrors(previous => ({ ...previous, evidenceRefs: null }));
    setFiles(previous => [...previous, ...selected.map(file => ({ file, key: globalThis.crypto.randomUUID() }))]);
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    const value = Number(amount.trim());
    const fieldErrors = {};
    if (!finalDecision && !notes.trim()) fieldErrors.handlingNotes = required;
    if (!result.trim()) fieldErrors.customerResult = required;
    if (hasAmount) {
      const error = amountError(amount.trim(), value, cap, finalDecision);
      if (error) fieldErrors.amountVnd = error;
    }
    if (reasonRequired && !fieldErrors.amountVnd) {
      if (!reason.trim()) fieldErrors.reason = required;
      if (!files.length) fieldErrors.evidenceRefs = required;
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length && !pending.current?.payload) return;
    locked.current = true;
    setBusy(true);
    let attempted = false;
    try {
      let payload = pending.current?.payload;
      if (!payload) {
        payload = { complaintId: item.id, expectedVersion: item.version, customerResult: result.trim() };
        if (finalDecision) {
          if (hasAmount) payload.amountVnd = value;
        } else {
          payload.handlingNotes = notes.trim();
          if (reasonRequired) {
            const evidenceRefs = [];
            for (const { file, key } of files) {
              const uploaded = await imageApi.upload(file, { idempotencyKey: key });
              evidenceRefs.push(uploaded.id);
            }
            payload.proposal = { amountVnd: value, reason: reason.trim(), evidenceRefs };
          }
        }
      }
      const idempotencyKey = retryKey(pending, payload);
      pending.current.payload = payload;
      attempted = true;
      const response = await (finalDecision ? api.decide : api.resolve)({ ...payload, idempotencyKey });
      if (response.pending) {
        setUncertain(true);
        setErrors({ form: 'Đang chờ xác nhận. Hãy thử lại để kiểm tra.' });
        return;
      }
      pending.current = null;
      setUncertain(false);
      setNotes('');
      setResult('');
      setAmount('');
      setReason('');
      setFiles([]);
      onComplete(response.data);
    } catch (error) {
      if (error.code === 'BILLING_SOURCE_UNAVAILABLE') {
        setBillingBlocked(true);
        setAmount('');
        pending.current = null;
        setUncertain(false);
        setErrors({ form: missingBilling });
      } else if (error.code === 'REFUND_CAP_EXCEEDED') {
        pending.current = null;
        setUncertain(false);
        setErrors({ amountVnd: 'Số tiền vượt phần còn lại của hóa đơn. Hãy tải lại hồ sơ để kiểm tra.' });
      } else {
        const unknown = attempted && uncertainComplaint(error);
        setUncertain(unknown);
        if (!unknown) pending.current = null;
        setErrors({ form: complaintError(error, 'Chưa lưu được kết quả. Hãy thử lại.') });
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const frozen = busy || uncertain;
  return <form className="complaint-management__form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
    {!finalDecision && <div>
      <label htmlFor="complaint-notes">Ghi chú xử lý *</label>
      <textarea id="complaint-notes" rows={3} maxLength={8000} value={notes} required disabled={frozen}
        aria-invalid={Boolean(errors.handlingNotes)} aria-describedby={errors.handlingNotes ? 'complaint-notes-error' : undefined}
        onChange={event => setNotes(event.target.value)} />
      <FieldError id="complaint-notes-error" message={errors.handlingNotes} />
    </div>}
    <div>
      <label htmlFor="complaint-result">{finalDecision ? 'Kết quả cuối gửi khách' : 'Kết quả gửi khách'} *</label>
      <textarea id="complaint-result" rows={3} maxLength={4000} value={result} required disabled={frozen}
        aria-invalid={Boolean(errors.customerResult)} aria-describedby={errors.customerResult ? 'complaint-result-error' : undefined}
        onChange={event => setResult(event.target.value)} />
      <FieldError id="complaint-result-error" message={errors.customerResult} />
    </div>
    <div>
      <label htmlFor="complaint-amount">{finalDecision ? 'Điều chỉnh số tiền' : 'Số tiền đề xuất hoàn'}</label>
      <input id="complaint-amount" inputMode="numeric" value={amount} maxLength={16}
        disabled={!canUseMoney || frozen} aria-invalid={Boolean(errors.amountVnd)}
        aria-describedby={errors.amountVnd ? 'complaint-amount-error' : 'complaint-amount-help'}
        onChange={event => setAmount(event.target.value)} />
      <p id="complaint-amount-help" className="complaint-management__muted">{canUseMoney
        ? (billing.basis === 'EXPECTED' ? 'Hóa đơn dự kiến ' : 'Hóa đơn ') + bookingMoney(billing.basisAmountVnd)
          + '. Còn lại ' + bookingMoney(cap) + '.'
        : missingBilling}</p>
      <FieldError id="complaint-amount-error" message={errors.amountVnd} />
    </div>
    {!finalDecision && <div>
      <label htmlFor="complaint-reason">Lý do và bằng chứng</label>
      <textarea id="complaint-reason" rows={3} maxLength={4000} value={reason} disabled={!reasonRequired || frozen}
        aria-required={reasonRequired} aria-invalid={Boolean(errors.reason)}
        aria-describedby={errors.reason ? 'complaint-reason-error' : 'complaint-reason-help'}
        onChange={event => setReason(event.target.value)} />
      <p id="complaint-reason-help" className="complaint-management__muted">Bắt buộc khi có số tiền.</p>
      <FieldError id="complaint-reason-error" message={errors.reason} />
      <label className="complaint-management__add-file"><span aria-hidden="true">+</span> Thêm tệp
        <input type="file" aria-label="Thêm tệp" accept="image/png,image/jpeg" multiple disabled={!reasonRequired || frozen}
          aria-describedby={errors.evidenceRefs ? 'complaint-evidence-error' : undefined} onChange={chooseFiles} />
      </label>
      <FieldError id="complaint-evidence-error" message={errors.evidenceRefs} />
      {files.length > 0 && <ul className="complaint-management__file-list">{files.map(({ file, key }) => <li key={key}>
        {file.name} <button type="button" disabled={frozen} aria-label={'Bỏ ' + file.name}
          onClick={() => setFiles(previous => previous.filter(row => row.key !== key))}>Bỏ</button>
      </li>)}</ul>}
    </div>}
    {item.billState === 'ON_HOLD' && <p className="complaint-management__bill-note">
      Hoá đơn của {item.booking?.code ?? 'lịch đặt'} được giữ đến khi kết quả là cuối cùng.
    </p>}
    <FieldError id="complaint-command-error" message={errors.form} />
    <Button type="submit" loading={busy}>
      {uncertain ? 'Thử lại' : finalDecision ? 'Ghi kết quả cuối' : 'Giải quyết'}
    </Button>
  </form>;
}
