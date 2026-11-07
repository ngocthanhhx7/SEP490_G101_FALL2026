import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalProductCart } from '../../contexts/ProductCartContext.jsx';
import { formatVnd, productErrorText, productMessage } from '../../utils/product-format.js';
import { ProductPhoto } from './ProductPhoto.jsx';
import './product-shop.css';

export function ProductCard({ product }) {
  const cart = useOptionalProductCart(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(null);
  const lock = useRef(false), to = `/products/${encodeURIComponent(product.id)}`;
  async function add() {
    if (lock.current || feedback?.uncertain) return;
    if (!cart.enabled && cart.sessionStatus !== 'authenticated') { navigate('/sign-in', { state: { from: to } }); return; }
    if (!cart.enabled) return;
    lock.current = true; setBusy(true); setFeedback(null);
    try { await cart.addLine(product.id, 1); setFeedback({ ok: true, text: productMessage('MSG99') }); }
    catch (error) { setFeedback({ ok: false, uncertain: !error.status || error.status >= 500,
      text: productErrorText(error) }); }
    finally { lock.current = false; setBusy(false); }
  }
  return <article className="pwc-shop-card pwc-product-card">
    <Link className="pwc-shop-photo-link" to={to} aria-label={`Ảnh ${product.name}`}><ProductPhoto product={product} /></Link>
    <h2 className="pwc-shop-card-title"><Link to={to}>{product.name}</Link></h2>
    <p className="pwc-shop-card-caption">{product.description || 'Xem chi tiết sản phẩm và thông tin sử dụng.'}</p>
    <div className="pwc-shop-card-meta">
      <strong className="pwc-shop-price">{formatVnd(product.sellingPrice)}</strong>
      <button type="button" className="pwc-product-add" aria-label={`Thêm ${product.name} vào giỏ hàng`}
        title={!product.inStock ? 'Hết hàng' : cart.sessionStatus === 'authenticated' && !cart.enabled ? 'Mua hàng bằng tài khoản khách hàng' : 'Thêm vào giỏ hàng'}
        disabled={!product.inStock || busy || feedback?.uncertain || ['loading', 'pending', 'error'].includes(cart.sessionStatus) || (cart.sessionStatus === 'authenticated' && !cart.enabled)} onClick={add}>
        <img src="/assets/figma-shop/add-cart.svg" alt="" />
      </button>
    </div>
    {!product.inStock && <span className="pwc-shop-badge is-out">Hết hàng</span>}
    {feedback && <p className={`pwc-product-card-feedback ${feedback.ok ? '' : 'is-error'}`} role={feedback.ok ? 'status' : 'alert'}>
      {feedback.text} <Link to="/customer/cart">Xem giỏ hàng</Link>
      {feedback.uncertain && ' · Kiểm tra giỏ hàng hoặc tải lại trước khi thử thêm.'}
    </p>}
  </article>;
}
