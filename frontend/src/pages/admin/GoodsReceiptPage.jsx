import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice } from '../../components/ui/index.js';
import { ProductSearch } from '../../components/product/ProductPicker.jsx';
import { GOODS_RECEIPT_FORM_LIMITS, GOODS_RECEIPT_TEXT as TEXT, RECEIPT_QUANTITY_INPUT_MAX_LENGTH } from '../../constants/goods-receipt.js';
import { formatDay, formatOrderDate, isUncertainOutcome, productErrorText, productMessage } from '../../utils/product-format.js';
import { parseAcceptedInput, parseReceivedInput, rejectedOf, validateReceiptForm } from '../../utils/goods-receipt-validation.js';
import '../../components/product/product-shop.css';
import '../../components/product/product-picker.css';
import './product-management.css';
import './goods-receipt.css';

const NO_ERRORS = { fields: {}, lineFields: {} };

// The text under a quantity or reason box, or nothing when the box is fine.
function lineErrorText(field, reason) {
  if (!reason) return undefined;
  if (field === 'quantityReceived') return reason === 'TOO_LARGE' ? TEXT.quantityTooLarge : productMessage('MSG113');
  if (field === 'quantityAccepted') return productMessage('MSG119');
  if (field === 'rejectReason') return reason === 'TOO_LONG' ? TEXT.reasonTooLong : productMessage('MSG120');
  return reason === 'DUPLICATE' ? TEXT.duplicateProduct : TEXT.productNotFound;
}

function supplierErrorText(reason) {
  return reason === 'REQUIRED' ? productMessage('MSG01') : TEXT.supplierNotFound;
}

function linesErrorText(reason) {
  return reason === 'TOO_MANY' ? TEXT.tooManyLines : TEXT.linesRequired;
}

// A saved receipt, read only. It opens from "Phiếu nhập gần đây" or from the link of a MSG122 notice.
function ReceiptView({ api, code, onNew }) {
  const load = useCallback(({ signal }) => api.readReceipt(code, { signal }).then((data) => ({ data })), [api, code]);
  const resource = useApiResource(load);
  const receipt = resource.status === 'success' ? resource.data : null;
  return <section className="pwc-shop-panel" aria-labelledby="receipt-view-title">
    <div className="pwc-pm-form-header">
      <h2 id="receipt-view-title">{receipt ? `Phiếu nhập ${receipt.code}` : 'Phiếu nhập'}</h2>
      <Button variant="secondary" onClick={onNew}>{TEXT.newReceipt}</Button>
    </div>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải phiếu nhập…" />}
    {resource.status === 'forbidden' && <Notice state="forbidden" title={TEXT.noPermission} />}
    {resource.status === 'error' && <Notice state="error" title={resource.code === 'RESOURCE_NOT_FOUND' ? TEXT.receiptNotFound : TEXT.loadFailed}
      action={resource.code === 'RESOURCE_NOT_FOUND' ? undefined : <Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {receipt && <>
      <dl className="pwc-gr-facts">
        <div><dt>Nhà cung cấp</dt><dd>{receipt.supplierName}</dd></div>
        <div><dt>Ngày nhận</dt><dd>{formatDay(receipt.receivedOn)}</dd></div>
        <div><dt>Người ghi</dt><dd>{receipt.recorderName}</dd></div>
      </dl>
      <div className="pwc-shop-table-wrap">
        <table className="pwc-shop-table pwc-shop-table--wide">
          <thead><tr><th>Sản phẩm</th><th>Số nhận</th><th>Nhận vào kho</th><th>Từ chối</th><th>Lý do từ chối</th></tr></thead>
          <tbody>{receipt.lines.map((line) => <tr key={line.productId}>
            <td><strong>{line.productName}</strong><br /><small>{line.productCode}</small></td>
            <td>{line.quantityReceived}</td><td>{line.quantityAccepted}</td><td>{line.quantityRejected}</td>
            <td>{line.rejectReason || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="pwc-gr-totals"><span className="pwc-gr-ok">Nhận vào kho: {receipt.totalAccepted}</span>
        <span className="pwc-gr-bad">Từ chối: {receipt.totalRejected}</span></p>
    </>}
  </section>;
}

function RecentReceipts({ resource, selected, onOpen }) {
  return <aside className="pwc-shop-panel" aria-labelledby="recent-receipts-title">
    <h2 id="recent-receipts-title">Phiếu nhập gần đây</h2>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải…" />}
    {resource.status === 'forbidden' && <Notice state="forbidden" title={TEXT.noPermission} />}
    {resource.status === 'error' && <Notice state="error" title={TEXT.loadFailed} action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'empty' && <p className="pwc-shop-hint">{TEXT.recentEmpty}</p>}
    {resource.status === 'success' && <ul className="pwc-gr-recent">
      {resource.data.map((receipt) => <li key={receipt.id}>
        <button type="button" aria-current={receipt.code === selected ? 'true' : undefined} aria-label={`Xem phiếu nhập ${receipt.code}`}
          onClick={() => onOpen(receipt.code)}>
          <strong>{receipt.code}</strong>
          <span>{formatDay(receipt.receivedOn)} · {receipt.supplierName}</span>
          <b>Nhận {receipt.totalReceived} · Từ chối {receipt.totalRejected}</b>
        </button>
      </li>)}
    </ul>}
  </aside>;
}

// Goods Receipt for Admin. The backend owns the rules, the code, the day, the recorder and the stock; this page asks for them.
// `recorderName` and the day are only shown: the system fills both in when the receipt is saved.
export function GoodsReceiptPage({ api, recorderName = '', clock = Date.now }) {
  const [params, setParams] = useSearchParams();
  const openCode = params.get('receipt');
  const [draft, setDraft] = useState({ supplierId: '', lines: [] });
  const [errors, setErrors] = useState(NO_ERRORS);
  const [failure, setFailure] = useState(null);
  const [saved, setSaved] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const command = useRef(null);

  const loadSuppliers = useCallback(({ signal }) => api.listSuppliers({ signal }), [api]);
  const suppliers = useApiResource(loadSuppliers);
  const loadRecent = useCallback(({ signal }) => api.listRecent({ signal }), [api]);
  const recent = useApiResource(loadRecent);

  const lines = draft.lines;
  const setLine = (index, changes) => setDraft((current) => ({ ...current,
    lines: current.lines.map((line, at) => (at === index ? { ...line, ...changes } : line)) }));
  const totals = lines.reduce((sum, line) => {
    const rejected = rejectedOf(line);
    const accepted = rejected === undefined ? 0 : parseAcceptedInput(line.accepted, parseReceivedInput(line.received).value).value;
    return { accepted: sum.accepted + accepted, rejected: sum.rejected + (rejected ?? 0) };
  }, { accepted: 0, rejected: 0 });

  function clearAfterEdit() { setSaved(null); setFailure(null); }

  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const found = validateReceiptForm(draft);
    setErrors(found); clearAfterEdit();
    if (Object.keys(found.fields).length > 0 || Object.keys(found.lineFields).length > 0) return;
    const body = { supplierId: draft.supplierId, lines: lines.map((line) => {
      const rejected = rejectedOf(line);
      return { productId: line.product.id, quantityReceived: Number(line.received.trim()), quantityAccepted: Number(line.accepted.trim()),
        ...(rejected > 0 ? { rejectReason: line.reason.trim() } : {}) };
    }) };
    // The same key is kept for an unchanged form, so saving again after a lost answer can never make a second receipt (D-218).
    const fingerprint = JSON.stringify(body);
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, key: `goods-receipt:${globalThis.crypto.randomUUID()}` };
    lock.current = true; setBusy(true);
    try {
      const receipt = await api.createReceipt(body, command.current.key);
      command.current = null;
      setDraft({ supplierId: '', lines: [] });
      setSaved(receipt);
      setSearching(false);
      recent.retry();
    } catch (error) {
      const code = error?.code;
      if (code === 'VALIDATION_FAILED' && (error.fields || error.lineFields)) setErrors({ fields: error.fields ?? {}, lineFields: error.lineFields ?? {} });
      else if (code === 'SUPPLIER_NOT_ACTIVE' || code === 'SUPPLIER_NOT_FOUND') {
        setFailure({ text: code === 'SUPPLIER_NOT_ACTIVE' ? TEXT.supplierNotActive : TEXT.supplierNotFound });
        setDraft((current) => ({ ...current, supplierId: '' }));
        suppliers.retry();
      } else if (code === 'PRODUCT_NOT_FOUND') setFailure({ text: TEXT.productNotFound });
      else if (code === 'RECEIPT_CODE_CONFLICT') setFailure({ text: TEXT.codeConflict });
      else if (code === 'FORBIDDEN') setFailure({ text: TEXT.noPermission });
      else if (isUncertainOutcome(error)) { setFailure({ text: TEXT.notSure }); recent.retry(); }
      else setFailure({ text: productErrorText(error) });
    } finally { lock.current = false; setBusy(false); }
  }

  const lineErrors = (index) => errors.lineFields[index] ?? {};
  const openReceipt = (code) => setParams({ receipt: code });

  return <section className="pwc-shop" aria-labelledby="goods-receipt-title">
    <h1 id="goods-receipt-title">Nhập hàng</h1>
    <p className="pwc-shop-lead">{TEXT.lead}</p>
    <div className="pwc-shop-split" style={{ marginTop: '1rem' }}>
      {openCode ? <ReceiptView key={openCode} api={api} code={openCode} onNew={() => setParams({})} />
        : <section className="pwc-shop-panel" aria-labelledby="new-receipt-title">
          <h2 id="new-receipt-title">Phiếu nhập mới</h2>
          {saved && <p className="pwc-shop-alert pwc-shop-alert--ok" role="status">{productMessage('MSG121', { code: saved.code })}{' '}
            <button type="button" className="pwc-shop-link-button" onClick={() => openReceipt(saved.code)}>Xem phiếu</button></p>}
          <form onSubmit={submit} noValidate>
            <div className="pwc-gr-head">
              <div className="pwc-pm-field">
                <label className="pwc-shop-label" htmlFor="receipt-supplier">Nhà cung cấp</label>
                <select id="receipt-supplier" className="pwc-shop-field" value={draft.supplierId} disabled={busy || suppliers.status !== 'success'}
                  aria-invalid={errors.fields.supplierId ? true : undefined} aria-describedby={errors.fields.supplierId ? 'receipt-supplier-error' : undefined}
                  onChange={(event) => { setDraft((current) => ({ ...current, supplierId: event.target.value })); clearAfterEdit(); }}>
                  <option value="">{TEXT.supplierPlaceholder}</option>
                  {suppliers.status === 'success' && suppliers.data.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
                {suppliers.status === 'empty' && <p className="pwc-shop-hint">{TEXT.noActiveSupplier}</p>}
                {suppliers.status === 'error' && <p className="pwc-shop-hint" role="alert">{TEXT.loadFailed}.{' '}
                  <button type="button" className="pwc-shop-link-button" onClick={suppliers.retry}>Thử lại</button></p>}
                {errors.fields.supplierId && <p className="pwc-pm-field-error" id="receipt-supplier-error">{supplierErrorText(errors.fields.supplierId)}</p>}
              </div>
              <div className="pwc-pm-field">
                <label className="pwc-shop-label" htmlFor="receipt-day">Ngày nhận</label>
                <input id="receipt-day" className="pwc-shop-field" readOnly value={formatOrderDate(new Date(clock()).toISOString())} />
              </div>
              <div className="pwc-pm-field">
                <label className="pwc-shop-label" htmlFor="receipt-recorder">Người ghi</label>
                <input id="receipt-recorder" className="pwc-shop-field" readOnly value={recorderName} />
              </div>
            </div>
            {lines.length === 0 && <p className="pwc-shop-hint pwc-gr-empty">{TEXT.noLines}</p>}
            {lines.length > 0 && <div className="pwc-shop-table-wrap">
              <table className="pwc-shop-table pwc-shop-table--wide pwc-gr-lines">
                <thead><tr><th>Sản phẩm</th><th>Số nhận</th><th>Nhận vào kho</th><th>Từ chối</th><th>Lý do từ chối</th>
                  <th><span className="pwc-visually-hidden">Bỏ dòng</span></th></tr></thead>
                <tbody>{lines.map((line, index) => {
                  const rejected = rejectedOf(line);
                  const bad = lineErrors(index);
                  const code = line.product.code;
                  return <tr key={line.product.id}>
                    <td><strong>{line.product.name}</strong>{!line.product.visible && <em> (đang ẩn)</em>}<br /><small>{code}</small>
                      {bad.productId && <p className="pwc-pm-field-error">{lineErrorText('productId', bad.productId)}</p>}</td>
                    <td><input className="pwc-shop-field pwc-gr-qty" inputMode="numeric" autoComplete="off" value={line.received}
                      maxLength={RECEIPT_QUANTITY_INPUT_MAX_LENGTH} aria-label={`Số nhận ${code}`} disabled={busy}
                      aria-invalid={bad.quantityReceived ? true : undefined}
                      onChange={(event) => { setLine(index, { received: event.target.value }); clearAfterEdit(); }} />
                      {bad.quantityReceived && <p className="pwc-pm-field-error">{lineErrorText('quantityReceived', bad.quantityReceived)}</p>}</td>
                    <td><input className="pwc-shop-field pwc-gr-qty" inputMode="numeric" autoComplete="off" value={line.accepted}
                      maxLength={RECEIPT_QUANTITY_INPUT_MAX_LENGTH} aria-label={`Nhận vào kho ${code}`} disabled={busy}
                      aria-invalid={bad.quantityAccepted ? true : undefined}
                      onChange={(event) => { setLine(index, { accepted: event.target.value }); clearAfterEdit(); }} />
                      {bad.quantityAccepted && <p className="pwc-pm-field-error">{lineErrorText('quantityAccepted', bad.quantityAccepted)}</p>}</td>
                    <td><output className={`pwc-gr-rejected${rejected > 0 ? ' is-rejecting' : ''}`} aria-label={`Từ chối ${code}`}>{rejected ?? '—'}</output></td>
                    <td><input className="pwc-shop-field" autoComplete="off" value={rejected > 0 ? line.reason : ''} placeholder="—"
                      maxLength={GOODS_RECEIPT_FORM_LIMITS.reasonMax} aria-label={`Lý do từ chối ${code}`} disabled={busy || !(rejected > 0)}
                      aria-invalid={bad.rejectReason ? true : undefined}
                      onChange={(event) => { setLine(index, { reason: event.target.value }); clearAfterEdit(); }} />
                      {bad.rejectReason && <p className="pwc-pm-field-error">{lineErrorText('rejectReason', bad.rejectReason)}</p>}</td>
                    <td><button type="button" className="pwc-picker-remove" disabled={busy} aria-label={`Bỏ ${code} ${line.product.name}`}
                      onClick={() => { setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) })); setErrors(NO_ERRORS); clearAfterEdit(); }}>×</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
            {errors.fields.lines && <p className="pwc-pm-field-error">{linesErrorText(errors.fields.lines)}</p>}
            <button type="button" className="pwc-shop-link-button" disabled={busy || lines.length >= GOODS_RECEIPT_FORM_LIMITS.linesMax} aria-expanded={searching}
              onClick={() => setSearching((value) => !value)}>{searching ? 'Đóng danh sách' : '+ Thêm sản phẩm'}</button>
            {searching && <ProductSearch productApi={api} selectedIds={lines.map((line) => line.product.id)}
              onPick={(product) => {
                setDraft((current) => ({ ...current, lines: [...current.lines, { product, received: '', accepted: '', reason: '' }] }));
                setSearching(false); setErrors(NO_ERRORS); clearAfterEdit();
              }} />}
            <p className="pwc-shop-alert pwc-gr-notice" role="note">{TEXT.rejectNotice}</p>
            {failure && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{failure.text}</p>}
            <div className="pwc-gr-footer">
              <p className="pwc-gr-totals"><span className="pwc-gr-ok">Nhận vào kho: {totals.accepted}</span>
                <span className="pwc-gr-bad">Từ chối: {totals.rejected}</span></p>
              <button type="submit" className="pwc-shop-primary-button pwc-gr-save" disabled={busy}>Lưu phiếu nhập</button>
            </div>
          </form>
        </section>}
      <RecentReceipts resource={recent} selected={openCode} onOpen={openReceipt} />
    </div>
  </section>;
}
