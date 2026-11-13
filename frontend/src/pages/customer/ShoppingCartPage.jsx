import { useEffect, useState } from 'react';
import { ArrowLeft, Info, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button } from '../../components/ui/index.js';
import { ProductPhoto } from '../../components/product/ProductPhoto.jsx';
import { QuantityStepper } from '../../components/product/QuantityStepper.jsx';
import { formatVnd, productErrorText, productMessage } from '../../utils/product-format.js';
import { PRODUCT_TIER_LABELS } from '../../constants/product-labels.js';
import '../../components/product/product-shop.css';

export function ShoppingCartPage() {
  const { cart, status, refresh, setLine, removeLine } = useProductCart();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  async function run(productId, operation) {
    setBusyId(productId); setError('');
    try { await operation(); } catch (failure) {
      let available;
      try { const latest = await refresh(); available = latest.lines.find((line) => line.productId === productId)?.available; } catch { /* keep going */ }
      setError(productErrorText(failure, { available }));
    } finally { setBusyId(null); }
  }

  const back = <Link className="pwc-shop-back" to="/products"><ArrowLeft aria-hidden="true" size={18} />Tiếp tục mua sắm</Link>;
  if (!cart && status === 'error') return <section className="pwc-shop">{back}<Notice state="error" title="Chưa tải được giỏ hàng"
    action={<Button variant="secondary" onClick={() => refresh().catch(() => {})}>Thử lại</Button>} /></section>;
  if (!cart) return <section className="pwc-shop">{back}<Notice state="loading" title="Đang tải giỏ hàng…" /></section>;
  if (cart.lineCount === 0) return <section className="pwc-shop">{back}<h1>Giỏ hàng</h1>
    <div className="pwc-shop-empty"><img src="/assets/figma-public/about-Image154.png" alt="" />
    <Notice state="empty" title={productMessage('MSG100')} action={<Link className="pwc-shop-outline-button" to="/products">Xem sản phẩm</Link>}>Chọn món ăn hoặc đồ dùng cho những ngày bên bé.</Notice></div></section>;

  return <section className="pwc-shop" aria-labelledby="cart-title">
    {back}
    <div className="pwc-shop-cart-intro"><h1 id="cart-title">Giỏ hàng của bạn<span className="pwc-shop-count-badge">{cart.lineCount} sản phẩm</span></h1>
    <p className="pwc-shop-lead">Kiểm tra những món đã chọn trước khi đặt hàng cho bé.</p></div>
    {error && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{error}</p>}
    <div className="pwc-shop-split">
      <div className="pwc-shop-panel pwc-shop-table-wrap">
        <table className="pwc-shop-table pwc-shop-cart-table">
          <thead><tr><th>Sản phẩm</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th><th><span className="pwc-visually-hidden">Xoá</span></th></tr></thead>
          <tbody>{cart.lines.map((line) => <tr key={line.productId}>
            <td><div className="pwc-shop-line"><ProductPhoto product={line} size="thumb" />
              <div><Link to={`/products/${encodeURIComponent(line.productId)}`}>{line.name}</Link><br /><small>{line.code}</small>
                {!line.purchasable && <><br /><small className="pwc-shop-alert--error">Sản phẩm không còn được bán.</small></>}
                {line.purchasable && line.exceedsAvailable && <><br /><small className="pwc-shop-alert--error">{productMessage('MSG58', { n: line.available })}</small></>}
              </div></div></td>
            <td><strong>{formatVnd(line.discountedUnitPrice ?? line.unitPrice)}</strong>
              {line.unitDiscount > 0 && <><br /><small><del>{formatVnd(line.unitPrice)}</del></small></>}</td>
            <td><QuantityStepper value={line.quantity} max={line.available} label={`Số lượng ${line.name}`}
              disabled={busyId === line.productId || !line.purchasable}
              onChange={(next) => run(line.productId, () => setLine(line.productId, next))} /></td>
            <td><strong className="pwc-shop-price">{formatVnd(line.netLineTotal ?? line.lineTotal)}</strong></td>
            <td><button type="button" className="pwc-shop-danger-button" aria-label={`Xoá ${line.name} khỏi giỏ hàng`}
              disabled={busyId === line.productId} onClick={() => run(line.productId, () => removeLine(line.productId))}><Trash2 aria-hidden="true" size={18} /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <aside className="pwc-shop-panel pwc-shop-summary" aria-label="Tóm tắt giỏ hàng">
        <h2>Tóm tắt giỏ hàng</h2>
        <div className="pwc-shop-summary-row"><span>Tạm tính</span><span>{formatVnd(cart.subtotal)}</span></div>
        {cart.tierDiscount > 0 && <div className="pwc-shop-summary-row">
          <span>Giảm giá hạng {PRODUCT_TIER_LABELS[cart.tierCode]}</span><span>− {formatVnd(cart.tierDiscount)}</span></div>}
        <div className="pwc-shop-summary-row pwc-shop-summary-total"><span>Tổng</span><strong>{formatVnd(cart.total)}</strong></div>
        <p className="pwc-shop-note"><Info aria-hidden="true" size={16} /> Phí giao hàng được tính ở bước thanh toán, theo khu vực phục vụ của địa chỉ nhận hàng.</p>
        {cart.hasUnavailable
          ? <button type="button" className="pwc-shop-primary-button" disabled>Thanh toán</button>
          : <Link className="pwc-shop-primary-button" to="/customer/product-checkout">Thanh toán</Link>}
        <p className="pwc-shop-hint" style={{ marginTop: '1rem' }}>Chọn giao đến nhà hoặc nhận tại cửa hàng ở bước tiếp theo.</p>
      </aside>
    </div>
  </section>;
}
