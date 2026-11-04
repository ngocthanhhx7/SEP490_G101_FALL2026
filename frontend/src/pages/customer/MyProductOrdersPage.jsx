import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button } from '../../components/ui/index.js';
import { OrderStatusBadge } from '../../components/product/OrderStatusBadge.jsx';
import { PRODUCT_RECEIVE_LABELS, PRODUCT_PAYMENT_LABELS } from '../../constants/product-labels.js';
import { formatOrderDate, formatVnd, productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

function OrderDetail({ order }) {
  return <aside className="pwc-shop-panel" aria-label={`Chi tiết đơn ${order.code}`}>
    <h2>Đơn {order.code} <OrderStatusBadge status={order.status} /></h2>
    <dl className="pwc-shop-facts">
      <dt>Ngày đặt</dt><dd>{formatOrderDate(order.createdAt)}</dd>
      <dt>Cách nhận</dt><dd>{PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</dd>
      {order.deliveryAddress && <><dt>Địa chỉ</dt><dd>{order.deliveryAddress.location}</dd></>}
      <dt>Thanh toán</dt><dd>{PRODUCT_PAYMENT_LABELS[order.paymentMethod].title}<br />
        <span className={`pwc-shop-status ${order.paid ? 'pwc-shop-status--done' : 'pwc-shop-status--muted'}`}>{order.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}</span></dd>
      {order.trackingCode && <><dt>Mã vận đơn</dt><dd>{order.trackingCode}</dd></>}
    </dl>
    <div style={{ borderTop: '1px solid var(--shop-border)', marginTop: '1rem', paddingTop: '.75rem' }}>
      {order.lines.map((line) => <div key={line.productId} className="pwc-shop-summary-row">
        <span>{line.productName} × {line.quantity}</span><strong>{formatVnd(line.lineTotal)}</strong></div>)}
      <div className="pwc-shop-summary-row"><span>Tạm tính</span><span>{formatVnd(order.subtotal)}</span></div>
      {order.receiveMethod === 'DELIVERY' && <div className="pwc-shop-summary-row"><span>Phí giao hàng</span><span>{formatVnd(order.shippingFee)}</span></div>}
      <div className="pwc-shop-summary-row pwc-shop-summary-total"><span>Tổng</span><strong>{formatVnd(order.total)}</strong></div>
    </div>
  </aside>;
}

export function MyProductOrdersPage() {
  const { api } = useProductCart();
  const placed = useLocation().state?.placed;
  const load = useCallback(({ signal }) => api.listOrders({ signal }), [api]);
  const resource = useApiResource(load);
  const [selectedId, setSelectedId] = useState(null);
  const orders = resource.data ?? [];
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];

  return <section className="pwc-shop" aria-labelledby="orders-title">
    <h1 id="orders-title">Đơn hàng của tôi</h1>
    <p className="pwc-shop-lead">Các đơn mua sản phẩm của bạn. Chọn một đơn để xem chi tiết.</p>
    {placed && <p className="pwc-shop-alert pwc-shop-alert--ok" role="status">{productMessage('MSG59', { code: placed })}</p>}
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn hàng…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được đơn hàng"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'empty' && <Notice state="empty" title={productMessage('MSG102')}
      action={<Link className="pwc-shop-outline-button" to="/products">Xem sản phẩm</Link>} />}
    {resource.status === 'success' && <div className="pwc-shop-split">
      <div className="pwc-shop-panel pwc-shop-table-wrap">
        <table className="pwc-shop-table pwc-shop-table--wide">
          <thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Cách nhận</th><th>Tổng tiền</th><th>Trạng thái</th><th><span className="pwc-visually-hidden">Xem</span></th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.id} className={order.id === selected?.id ? 'is-selected' : undefined}>
            <td><strong>{order.code}</strong></td><td>{formatOrderDate(order.createdAt)}</td>
            <td>{PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</td><td><strong>{formatVnd(order.total)}</strong></td>
            <td><OrderStatusBadge status={order.status} /></td>
            <td><button type="button" className="pwc-shop-link-button" aria-label={`Xem đơn ${order.code}`}
              aria-pressed={order.id === selected?.id} onClick={() => setSelectedId(order.id)}>Xem</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {selected && <OrderDetail order={selected} />}
    </div>}
  </section>;
}
