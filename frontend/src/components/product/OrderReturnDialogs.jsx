import { useId, useState } from 'react';
import { Button, Dialog, Input, Select } from '../ui/index.js';
import { FieldFrame } from '../ui/FieldFrame.jsx';
import { PRODUCT_RETURN_REASON_LABELS } from '../../constants/product-labels.js';
import { productMessage } from '../../utils/product-format.js';
import './product-shop.css';

const NOTE_MAX = 500;
const CARRIER_REASON_MAX = 300;

// `onSubmit` resolves to null when the change was applied, or to the text to show when it was not.
function useSubmit(onSubmit) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function submit(values) {
    if (busy) return;
    setBusy(true); setFailure('');
    const text = await onSubmit(values);
    // On success the parent closes the dialog, so only a failure needs the form back.
    if (text) { setFailure(text); setBusy(false); }
  }
  return { busy, failure, submit };
}

function DialogFooter({ formId, busy, onClose, confirmLabel }) {
  return <>
    <Button variant="secondary" disabled={busy} onClick={onClose}>Huỷ</Button>
    <Button type="submit" form={formId} loading={busy}>{confirmLabel}</Button>
  </>;
}

// R3 UC-65: "Being returned" asks for the carrier's reason. R3 has no message for a missing reason, so the form blocks it here.
export function MarkReturningDialog({ order, onClose, onSubmit }) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const { busy, failure, submit } = useSubmit(onSubmit);
  function handleSubmit(event) {
    event.preventDefault();
    const text = reason.trim();
    if (!text) { setError('Vui lòng nhập lý do của hãng.'); return; }
    setError('');
    submit(text);
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} dismissible={!busy} title={`Đơn ${order.code} đang hoàn về`}
    description="Nhập lý do hãng vận chuyển đưa ra khi hoàn đơn."
    footer={<DialogFooter formId={formId} busy={busy} onClose={onClose} confirmLabel="Xác nhận đang hoàn về" />}>
    <form id={formId} onSubmit={handleSubmit} noValidate>
      <Input label="Lý do của hãng" required value={reason} maxLength={CARRIER_REASON_MAX} autoComplete="off" error={error}
        onChange={(event) => setReason(event.target.value)} />
      {failure && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{failure}</p>}
    </form>
  </Dialog>;
}

const WHOLE_NUMBER = /^\d{1,3}$/u;

// R3 UC-66: confirm that the returned parcel is back, why, and how much of each line can be sold again.
export function ConfirmReturnedDialog({ order, onClose, onSubmit }) {
  const formId = useId();
  const noteId = useId();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState(() => Object.fromEntries(order.lines.map((line) => [line.productId, ''])));
  const [errors, setErrors] = useState({});
  const { busy, failure, submit } = useSubmit(onSubmit);
  function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    if (!reason) next.reason = 'Vui lòng chọn lý do hoàn về.';
    for (const line of order.lines) {
      const value = quantities[line.productId].trim();
      // Same message as the API (MSG104) for every quantity that is not a whole number from 0 to the returned quantity.
      if (!WHOLE_NUMBER.test(value) || Number(value) > line.quantity) next[line.productId] = productMessage('MSG104');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    submit({
      reason, ...(note.trim() ? { note: note.trim() } : {}),
      lines: order.lines.map((line) => ({ productId: line.productId, resellableQuantity: Number(quantities[line.productId]) }))
    });
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} dismissible={!busy} title={`Xác nhận đơn ${order.code} đã hoàn về`}
    description="Chỉ số lượng bán lại được mới được cộng lại vào kho."
    footer={<DialogFooter formId={formId} busy={busy} onClose={onClose} confirmLabel="Xác nhận đã hoàn về" />}>
    <form id={formId} onSubmit={handleSubmit} noValidate>
      <dl className="pwc-shop-facts">
        <dt>Lý do của hãng</dt><dd>{order.carrierReturnReason ?? 'Chưa ghi'}</dd>
      </dl>
      <Select label="Lý do hoàn về" required value={reason} error={errors.reason} onChange={(event) => setReason(event.target.value)}>
        <option value="">Chọn lý do</option>
        {Object.entries(PRODUCT_RETURN_REASON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select>
      {order.lines.map((line) => <Input key={line.productId} label={`Số bán lại được: ${line.productName}`} required inputMode="numeric"
        hint={`Số lượng hoàn về: ${line.quantity}`} value={quantities[line.productId]} maxLength={3} autoComplete="off" error={errors[line.productId]}
        onChange={(event) => setQuantities((current) => ({ ...current, [line.productId]: event.target.value }))} />)}
      <FieldFrame id={noteId} label="Ghi chú">
        <textarea id={noteId} className="pwc-control" rows={3} maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
      </FieldFrame>
      {failure && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{failure}</p>}
    </form>
  </Dialog>;
}
