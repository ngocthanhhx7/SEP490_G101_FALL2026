import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { Notice, Button } from '../../components/ui/index.js';
import { ProductPhoto } from '../../components/product/ProductPhoto.jsx';
import { QuantityStepper } from '../../components/product/QuantityStepper.jsx';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_PET_LABELS } from '../../constants/product-labels.js';
import { formatVnd, productErrorText, productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

export function ProductDetailsPage() {
  const { productId } = useParams();
  const { api, addLine } = useProductCart();
  const session = useSession();
  const navigate = useNavigate();
  const load = useCallback(({ signal }) => api.getProduct(productId, { signal }), [api, productId]);
  const resource = useApiResource(load);
  const [fresh, setFresh] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => { setFresh(null); setQuantity(1); setFeedback(null); }, [productId]);
  const product = fresh ?? resource.data;

  // A warning about the old number no longer applies once the customer changes it.
  function changeQuantity(next) {
    setQuantity(next);
    setFeedback((current) => (current && !current.ok ? null : current));
  }

  async function add() {
    if (session.status !== 'authenticated') { navigate('/sign-in', { state: { from: `/products/${productId}` } }); return; }
    setBusy(true); setFeedback(null);
    try {
      await addLine(product.id, quantity);
      setFeedback({ ok: true, text: productMessage('MSG99') });
    } catch (error) {
      let available;
      if (['PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', 'PRODUCT_OUT_OF_STOCK'].includes(error.code)) {
        // Re-read the product so the message and the stepper use the current sellable quantity.
        try { const latest = await api.getProduct(product.id); setFresh(latest.data); available = latest.data.available;
          setQuantity((value) => Math.max(1, Math.min(value, available))); } catch { /* keep the previous numbers */ }
      }
      setFeedback({ ok: false, text: productErrorText(error, { available }) });
    } finally { setBusy(false); }
  }

  const back = <Link className="pwc-shop-back" to="/products"><ArrowLeft aria-hidden="true" size={18} />Quay lại Sản phẩm</Link>;
  if (resource.status === 'loading') return <section className="pwc-shop">{back}<Notice state="loading" title="Đang tải sản phẩm…" /></section>;
  if (!product) return <section className="pwc-shop">{back}<Notice state="error" title="Không tìm thấy sản phẩm"
    action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Sản phẩm không tồn tại hoặc không còn được bán.</Notice></section>;

  return <section className="pwc-shop" aria-labelledby="product-title">
    {back}
    <div className="pwc-shop-split pwc-shop-split--detail">
      <div className="pwc-shop-panel"><ProductPhoto product={product} size="hero" /></div>
      <div className="pwc-shop-panel">
        <p className="pwc-shop-eyebrow">{PRODUCT_CATEGORY_LABELS[product.category]} · {PRODUCT_PET_LABELS[product.petType]}</p>
        <h1 id="product-title">{product.name}</h1>
        <span className={`pwc-shop-badge ${product.inStock ? 'is-in' : 'is-out'}`}>{product.inStock ? 'Còn hàng' : 'Hết hàng'}</span>
        <div className="pwc-shop-detail-price">
          <span>Giá bán</span><br /><strong className="pwc-shop-price pwc-shop-price--large">{formatVnd(product.sellingPrice)}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
          <span id="quantity-label" style={{ fontWeight: 800 }}>Số lượng</span>
          <QuantityStepper value={quantity} max={product.available} disabled={!product.inStock || busy} label="Số lượng"
            onChange={changeQuantity} onLimit={() => setFeedback({ ok: false, text: productMessage('MSG58', { n: Math.min(99, product.available) }) })} />
        </div>
        {!product.inStock && <p className="pwc-shop-alert pwc-shop-alert--error" role="status">{productMessage('MSG98')}</p>}
        {feedback && <p className={`pwc-shop-alert pwc-shop-alert--${feedback.ok ? 'ok' : 'error'}`} role="status">
          {feedback.text} {feedback.ok && <Link to="/customer/cart">Xem giỏ hàng</Link>}</p>}
        <button type="button" className="pwc-shop-primary-button" disabled={!product.inStock || busy} onClick={add}>
          {busy ? 'Đang thêm…' : 'Thêm vào giỏ hàng'}</button>
        <p className="pwc-shop-lead" style={{ marginTop: '.75rem' }}>Bạn chỉ đặt được số lượng còn lại trong kho.</p>
        <div className="pwc-shop-detail-facts"><p><strong>Nhận hàng theo cách của bạn</strong><br />Nhận tại cửa hàng hoặc giao đến địa chỉ trong khu vực phục vụ.</p>
          <p><strong>Thanh toán khi nhận</strong><br />Trả tại quầy hoặc thanh toán COD khi được giao hàng.</p></div>
      </div>
    </div>
    <div className="pwc-shop-panel" style={{ marginTop: '1.5rem' }}>
      <h2>Mô tả sản phẩm</h2>
      <p className="pwc-photo-credits"><a href="/assets/products/credits.html">Ảnh minh họa sản phẩm và nguồn ảnh</a></p>
      <p>{product.description || 'Chưa có mô tả cho sản phẩm này.'}</p>
      <dl className="pwc-shop-facts">
        <dt>Mã sản phẩm</dt><dd>{product.code}</dd>
        <dt>Danh mục</dt><dd>{PRODUCT_CATEGORY_LABELS[product.category]}</dd>
        <dt>Dành cho</dt><dd>{PRODUCT_PET_LABELS[product.petType]}</dd>
      </dl>
    </div>
  </section>;
}
