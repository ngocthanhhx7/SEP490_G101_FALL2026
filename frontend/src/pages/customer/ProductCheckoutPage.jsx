import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button } from '../../components/ui/index.js';
import { PRODUCT_RECEIVE_LABELS, PRODUCT_PAYMENT_LABELS, PRODUCT_TIER_LABELS } from '../../constants/product-labels.js';
import { formatVnd, isUncertainOutcome, productErrorText, productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

const PAYMENT_BY_RECEIVE = { DELIVERY: 'COD', PICKUP: 'PAY_AT_SHOP' };
const receiveHints = { DELIVERY: 'Giao đến địa chỉ trong khu vực phục vụ', PICKUP: 'Đến cửa hàng lấy hàng khi đơn sẵn sàng' };

export function ProductCheckoutPage() {
  const { api, cart, status, refresh } = useProductCart();
  const navigate = useNavigate();
  const loadAddresses = useCallback(({ signal }) => api.addresses({ signal }), [api]);
  const addresses = useApiResource(loadAddresses);
  const [receiveMethod, setReceiveMethod] = useState('DELIVERY');
  const [addressId, setAddressId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prepaidOnlyResponse, setPrepaidOnlyResponse] = useState(false);
  const command = useRef(null), locked = useRef(false);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const paymentMethod = PAYMENT_BY_RECEIVE[receiveMethod];
  const delivery = receiveMethod === 'DELIVERY';
  const shippingFee = delivery && cart ? cart.deliveryFee : 0;
  const prepaidOnly = prepaidOnlyResponse || cart?.prepaidOnly === true;
  const addressOptions = addresses.data ?? [];
  const idOf = (address) => String(address.id ?? address._id);
  // A single saved address leaves nothing to choose, so it is preselected; with several the customer must pick one.
  const chosenAddressId = addressId || (addressOptions.length === 1 ? idOf(addressOptions[0]) : '');

  async function submit() {
    if (locked.current || prepaidOnly) return;
    if (!cart || cart.lineCount === 0) { setError(productMessage('MSG100')); return; }
    if (delivery && !chosenAddressId) { setError(productMessage('MSG101')); return; }
    const body = { receiveMethod, paymentMethod, ...(delivery ? { addressId: chosenAddressId } : {}) };
    // The same key is reused for an unchanged order so an uncertain retry can never create a second order.
    const fingerprint = JSON.stringify(body);
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, key: `product-order:${globalThis.crypto.randomUUID()}` };
    locked.current = true; setBusy(true); setError('');
    try {
      const order = await api.placeOrder(body, command.current.key);
      command.current = null;
      await refresh().catch(() => {});
      window.dispatchEvent(new window.Event('pwc:notifications-changed'));
      navigate('/customer/product-orders', { state: { placed: order.code } });
    } catch (failure) {
      if (failure.code === 'PRODUCT_ORDER_PREPAY_REQUIRED') {
        setPrepaidOnlyResponse(true);
        await refresh().then(() => setPrepaidOnlyResponse(false)).catch(() => {});
      } else if (isUncertainOutcome(failure)) {
        setError('Chưa nhận được xác nhận đơn hàng. Hãy kiểm tra mục Đơn hàng của tôi trước khi đặt lại.');
      } else {
        let available;
        try { const latest = await refresh(); available = latest.lines.find((line) => line.available < line.quantity)?.available; } catch { /* keep going */ }
        setError(productErrorText(failure, { available }));
      }
    } finally { locked.current = false; setBusy(false); }
  }

  const back = <Link className="pwc-shop-back" to="/customer/cart"><ArrowLeft aria-hidden="true" size={18} />Quay lại giỏ hàng</Link>;
  if (!cart && status === 'error') return <section className="pwc-shop">{back}<Notice state="error" title="Chưa tải được giỏ hàng"
    action={<Button variant="secondary" onClick={() => refresh().catch(() => {})}>Thử lại</Button>} /></section>;
  if (!cart) return <section className="pwc-shop">{back}<Notice state="loading" title="Đang tải đơn hàng…" /></section>;
  if (cart.lineCount === 0) return <section className="pwc-shop">{back}<h1>Thanh toán đơn hàng</h1>
    <Notice state="empty" title={productMessage('MSG100')} action={<Link className="pwc-shop-outline-button" to="/products">Xem sản phẩm</Link>} /></section>;

  return <section className="pwc-shop" aria-labelledby="checkout-title">
    {back}
    <h1 id="checkout-title">Thanh toán đơn hàng</h1>
    <div className="pwc-shop-split">
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div className="pwc-shop-panel">
          <h2>Cách nhận hàng</h2>
          <div className="pwc-shop-option-grid" role="radiogroup" aria-label="Cách nhận hàng">
            {Object.keys(PRODUCT_RECEIVE_LABELS).map((method) => <label key={method} className="pwc-shop-option">
              <input type="radio" name="receiveMethod" value={method} checked={receiveMethod === method}
                onChange={() => { setReceiveMethod(method); setError(''); }} />{' '}
              <strong style={{ display: 'inline' }}>{PRODUCT_RECEIVE_LABELS[method]}</strong><br /><small>{receiveHints[method]}</small>
            </label>)}
          </div>
          {delivery && <>
            <label className="pwc-shop-label" htmlFor="delivery-address">Địa chỉ nhận hàng</label>
            <select id="delivery-address" className="pwc-shop-field" value={chosenAddressId} onChange={(event) => { setAddressId(event.target.value); setError(''); }}>
              <option value="">Chọn địa chỉ</option>
              {addressOptions.map((address) => <option key={idOf(address)} value={idOf(address)}>{address.label}</option>)}
            </select>
            {addresses.status === 'error' && <p role="alert">Chưa tải được địa chỉ. <button type="button" className="pwc-shop-link-button" onClick={addresses.retry}>Tải lại địa chỉ</button></p>}
            {addresses.status === 'empty' && <p>Bạn chưa có địa chỉ. <Link to="/account/addresses">Thêm địa chỉ</Link></p>}
            <p className="pwc-shop-lead" style={{ marginTop: '.5rem' }}>Phí giao hàng tính theo khu vực phục vụ của địa chỉ này.</p>
          </>}
        </div>
        <div className="pwc-shop-panel">
          <h2>Cách thanh toán</h2>
          {prepaidOnly ? <p role="status">{productMessage('MSG60')}</p>
            : <div className="pwc-shop-option is-selected"><strong>{PRODUCT_PAYMENT_LABELS[paymentMethod].title}</strong><small>{PRODUCT_PAYMENT_LABELS[paymentMethod].hint}</small></div>}
        </div>
      </div>
      <aside className="pwc-shop-panel" aria-label="Đơn hàng của bạn">
        <h2>Đơn hàng của bạn</h2>
        {cart.lines.map((line) => <div key={line.productId} className="pwc-shop-summary-row">
          <span>{line.name} × {line.quantity}</span><strong>{formatVnd(line.lineTotal)}</strong></div>)}
        <div className="pwc-shop-summary-row" style={{ borderTop: '1px solid var(--shop-border)', marginTop: '.5rem' }}><span>Tạm tính</span><span>{formatVnd(cart.subtotal)}</span></div>
        {cart.tierDiscount > 0 && <div className="pwc-shop-summary-row">
          <span>Giảm giá hạng {PRODUCT_TIER_LABELS[cart.tierCode]}</span><span>− {formatVnd(cart.tierDiscount)}</span></div>}
        {delivery && <div className="pwc-shop-summary-row"><span>Phí giao hàng</span><span>{formatVnd(shippingFee)}</span></div>}
        <div className="pwc-shop-summary-row pwc-shop-summary-total"><span>Tổng</span><strong>{formatVnd(cart.total + shippingFee)}</strong></div>
        {!prepaidOnly && error && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{error}</p>}
        <button type="button" className="pwc-shop-primary-button" disabled={prepaidOnly || busy || cart.hasUnavailable} onClick={submit}>{busy ? 'Đang đặt hàng…' : 'Đặt hàng'}</button>
        <p className="pwc-shop-lead" style={{ marginTop: '.75rem' }}>Khi bạn đặt hàng, số lượng được giữ cho bạn.</p>
      </aside>
    </div>
  </section>;
}
