import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice, Pagination } from '../../components/ui/index.js';
import { ProductSearch } from '../../components/product/ProductPicker.jsx';
import { STOCK_ADJUSTMENT_PAGE_SIZE, STOCK_ADJUSTMENT_REASON_LABELS, STOCK_ADJUSTMENT_TEXT as TEXT, STOCK_ADJUSTMENT_TYPES } from '../../constants/stock-adjustment.js';
import { productMessage, formatOrderDate } from '../../utils/product-format.js';
import { formatStockQuantity } from '../../utils/stock-format.js';
import { formatAdjustmentDelta } from '../../utils/stock-adjustment-format.js';
import { validateAdjustmentForm, previewAdjustmentStock } from '../../utils/stock-adjustment-validation.js';
import '../../components/product/product-shop.css';
import './stock-adjustment.css';

function Failure({ retry }) {
  return <Notice state="error" title={TEXT.failed} action={<Button variant="secondary" onClick={retry}>Thử lại</Button>} />;
}
function Field({ id, label, error, children }) {
  return <div className="pwc-sa-field"><label className="pwc-shop-label" htmlFor={id}>{label}</label>{children}
    {error && <p className="pwc-sa-error" id={`${id}-error`}>{error}</p>}</div>;
}

export function StockAdjustmentPage({ api }) {
  const [selected, setSelected] = useState(null), [searching, setSearching] = useState(false);
  const [type, setType] = useState('DECREASE'), [quantity, setQuantity] = useState(''), [reason, setReason] = useState('');
  const [page, setPage] = useState(1), [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null), [failure, setFailure] = useState(false), [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflictAvailable, setConflictAvailable] = useState(null);
  const lock = useRef(false), command = useRef(null);
  const selectedId = selected?.id;
  const loadProduct = useCallback(({ signal }) => selectedId
    ? api.readProduct(selectedId,{signal}).then(data => ({data})) : Promise.resolve({data:null}), [api, selectedId]);
  const productResource = useApiResource(loadProduct);
  const product = productResource.status === 'success' && productResource.data.id === selectedId ? productResource.data : null;
  const loadList = useCallback(({signal}) => api.listAdjustments({page,limit:STOCK_ADJUSTMENT_PAGE_SIZE},{signal}), [api,page]);
  const recorded = useApiResource(loadList);
  const preview = previewAdjustmentStock(product,type,quantity);
  function edited(field) {
    command.current = null; setNotice(null); setFailure(false); setConflictAvailable(null);
    setErrors(current => ({...current,[field]:undefined}));
  }
  function errorText(field) {
    const error = errors[field];
    if (!error) return undefined;
    if (field !== 'quantity') return productMessage('MSG01');
    if (error === 'EXCEEDS_AVAILABLE') return productMessage('MSG123',{n:conflictAvailable ?? product?.available ?? 0});
    return error === 'TOO_LARGE' ? TEXT.quantityMax : productMessage('MSG113');
  }
  const invalidProps = field => errors[field] ? {'aria-invalid':true,'aria-describedby':`adjustment-${field}-error`} : {};
  async function submit(event) {
    event.preventDefault(); if (lock.current) return;
    const found = command.current?.uncertain ? {} : validateAdjustmentForm({product,type,quantity,reason});
    setErrors(found); setNotice(null); setFailure(false);
    if (Object.keys(found).length) return;
    const body = command.current?.uncertain ? command.current.body : {productId:product.id,type,quantity:Number(quantity.trim()),reason};
    const fingerprint = JSON.stringify(body);
    if (command.current?.fingerprint !== fingerprint) command.current = {fingerprint,body,key:`stock-adjustment:${globalThis.crypto.randomUUID()}`};
    lock.current = true; setBusy(true);
    try {
      const saved = await api.createAdjustment(body,command.current.key);
      command.current = null; setUncertain(false); setQuantity(''); setReason(''); setErrors({}); setConflictAvailable(null); setSearching(false);
      setNotice(productMessage('MSG124',{code:saved.code}));
      setPage(1); recorded.retry(); productResource.retry();
    } catch (error) {
      if (!error?.status || error.status >= 500 || ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code)) {
        command.current.uncertain = true; setUncertain(true);
      }
      if (error?.code === 'STOCK_ADJUSTMENT_EXCEEDS_AVAILABLE' && Number.isSafeInteger(error.available)) {
        setConflictAvailable(error.available); setErrors({quantity:'EXCEEDS_AVAILABLE'}); productResource.retry();
      } else if (error?.code === 'VALIDATION_FAILED' && error.fields) setErrors(error.fields);
      else { setFailure(true); if (error?.code === 'PRODUCT_NOT_FOUND') productResource.retry(); }
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="pwc-shop pwc-sa" aria-labelledby="stock-adjustment-title">
    <div className="pwc-sa-heading"><div><h1 id="stock-adjustment-title">Điều chỉnh tồn kho</h1>
      <p className="pwc-shop-lead">Tăng hoặc giảm tồn thực tế khi hàng hỏng, mất, dùng nội bộ hoặc phiếu nhập ghi sai.</p></div>
      <Link className="pwc-shop-outline-button" to="/admin/stock">Xem tồn kho</Link></div>
    {notice && <Notice state="success" title={notice} />}
    <div className="pwc-sa-columns">
      <form className="pwc-shop-panel pwc-sa-form" onSubmit={submit} noValidate aria-labelledby="new-adjustment-title">
        <h2 id="new-adjustment-title">Phiếu điều chỉnh mới</h2>
        <Field id="adjustment-productId" label="Sản phẩm" error={errorText('productId')}>
          <button id="adjustment-productId" type="button" className="pwc-shop-field pwc-sa-product" aria-label="Chọn sản phẩm" aria-expanded={searching}
            disabled={busy || uncertain} onClick={() => setSearching(value => !value)} {...invalidProps('productId')}>
            {selected ? `${selected.code} · ${selected.name}` : 'Chọn sản phẩm'}<ChevronDown size={16} aria-hidden="true" /></button>
          {searching && !busy && !uncertain && <ProductSearch productApi={api} selectedIds={[]} onPick={value => {
            edited('productId'); setSelected(value); setSearching(false);
          }} />}
        </Field>
        {selected && productResource.status === 'loading' && <Notice state="loading" title="Đang tải số tồn…" />}
        {selected && ['error','forbidden'].includes(productResource.status) && <Failure retry={productResource.retry} />}
        <dl className="pwc-sa-stock">{[['Tồn thực tế','stockOnHand'],['Đang giữ','quantityHeld'],['Có thể bán','available']].map(([label,field]) =>
          <div key={field}><dt>{label}</dt><dd><output aria-label={label}>{product ? formatStockQuantity(product[field]) : '—'}</output></dd></div>)}</dl>
        <fieldset className="pwc-sa-directions" disabled={busy || uncertain}><legend>Loại điều chỉnh</legend><div>
          {STOCK_ADJUSTMENT_TYPES.map(([value,label]) => <label key={value}><input type="radio" name="adjustment-type" value={value} checked={type===value}
            onChange={() => {edited('type');setType(value);}} />{label}</label>)}</div></fieldset>
        <div className="pwc-sa-inputs">
          <Field id="adjustment-quantity" label="Số lượng" error={errorText('quantity')}>
            <input id="adjustment-quantity" className="pwc-shop-field" inputMode="numeric" value={quantity} disabled={busy || uncertain} autoComplete="off" maxLength={7}
              onChange={event => {edited('quantity');setQuantity(event.target.value);}} {...invalidProps('quantity')} />
          </Field>
          <Field id="adjustment-reason" label="Lý do" error={errorText('reason')}>
            <select id="adjustment-reason" className="pwc-shop-field" value={reason} disabled={busy || uncertain}
              onChange={event => {edited('reason');setReason(event.target.value);}} {...invalidProps('reason')}>
              <option value="">Chọn lý do</option>{Object.entries(STOCK_ADJUSTMENT_REASON_LABELS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </Field>
        </div>
        <div className="pwc-sa-preview"><span>Tồn thực tế sau khi lưu</span><output aria-label="Tồn thực tế sau khi lưu">{preview === null ? '—' : formatStockQuantity(preview)}</output></div>
        {failure && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{TEXT.failed}</p>}
        {uncertain && <p role="status">Chưa xác định phiếu đã được lưu hay chưa. Kiểm tra lại cùng yêu cầu trước khi tạo hoặc sửa phiếu khác.</p>}
        <button type="submit" className="pwc-shop-primary-button" disabled={busy}>{uncertain ? 'Kiểm tra lại phiếu điều chỉnh' : 'Lưu phiếu điều chỉnh'}</button>
      </form>
      <section className="pwc-shop-panel pwc-sa-recorded" aria-labelledby="recorded-adjustments-title">
        <h2 id="recorded-adjustments-title">Phiếu đã ghi</h2><p className="pwc-shop-hint">{TEXT.immutable}</p>
        {recorded.status === 'loading' && <Notice state="loading" title="Đang tải phiếu…" />}
        {['error','forbidden'].includes(recorded.status) && <Failure retry={recorded.retry} />}
        {recorded.status === 'empty' && <Notice state="empty" title="Chưa có phiếu điều chỉnh." />}
        {recorded.status === 'success' && <ul className="pwc-sa-receipts">{recorded.data.map(item => <li key={item.id}>
          <div><p><strong>{item.code}</strong> · <time dateTime={item.recordedAt}>{formatOrderDate(item.recordedAt)}</time></p>
            <p className="pwc-sa-name">{item.productName}</p><p className="pwc-sa-reason">Lý do: {STOCK_ADJUSTMENT_REASON_LABELS[item.reason]} · {item.recorderName}</p></div>
          <strong className={`pwc-sa-delta${item.quantityChange < 0 ? ' is-negative' : ''}`}>{formatAdjustmentDelta(item.quantityChange)}</strong>
        </li>)}</ul>}
        {['success','empty'].includes(recorded.status) && recorded.meta?.page && <Pagination {...recorded.meta.page} itemLabel="phiếu" onPageChange={setPage} />}
      </section>
    </div>
  </section>;
}
