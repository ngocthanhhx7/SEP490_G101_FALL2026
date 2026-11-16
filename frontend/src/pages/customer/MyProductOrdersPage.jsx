import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button, Pagination } from '../../components/ui/index.js';
import { OrderStatusBadge } from '../../components/product/OrderStatusBadge.jsx';
import { PRODUCT_RECEIVE_LABELS, PRODUCT_PAYMENT_LABELS, PRODUCT_TIER_LABELS } from '../../constants/product-labels.js';
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
      {order.tierDiscount > 0 && <div className="pwc-shop-summary-row">
        <span>Giảm giá hạng {PRODUCT_TIER_LABELS[order.tierCode]}</span><span>− {formatVnd(order.tierDiscount)}</span></div>}
      {order.receiveMethod === 'DELIVERY' && <div className="pwc-shop-summary-row"><span>Phí giao hàng</span><span>{formatVnd(order.shippingFee)}</span></div>}
      <div className="pwc-shop-summary-row pwc-shop-summary-total"><span>Tổng</span><strong>{formatVnd(order.total)}</strong></div>
    </div>
  </aside>;
}

export function MyProductOrdersPage() {
  const { api } = useProductCart();
  const placed = useLocation().state?.placed;
  const [params] = useSearchParams();
  const requested = /^[a-f0-9]{24}$/i.test(params.get('order') ?? '') ? params.get('order') : null;
  const [page, setPage] = useState(1);
  const load = useCallback(({ signal }) => api.listOrders({ signal, page }), [api, page]);
  const resource = useApiResource(load);
  const [selectedId, setSelectedId] = useState(requested);
  useEffect(() => { setSelectedId(requested); }, [requested]);
  const loadRequested = useCallback(({ signal }) => requested ? api.getOrder(requested, { signal }) : Promise.resolve({ data: null }), [api, requested]);
  const requestedOrder = useApiResource(loadRequested);
  const orders = resource.data ?? [];
  const selected = orders.find((order) => order.id === selectedId) ?? (selectedId === requested ? requestedOrder.data : null) ?? (!requested ? orders[0] : null);

  return <section className="pwc-shop" aria-labelledby="orders-title">
    <h1 id="orders-title">Đơn mua sản phẩm</h1>
    <p className="pwc-shop-lead">Các đơn mua sản phẩm của bạn. Chọn một đơn để xem chi tiết.</p>
    {placed && <p className="pwc-shop-alert pwc-shop-alert--ok" role="status">{productMessage('MSG59', { code: placed })}</p>}
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn hàng…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được đơn hàng"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'empty' && !requested && <Notice state="empty" title={productMessage('MSG102')}
      action={<Link className="pwc-shop-outline-button" to="/products">Xem sản phẩm</Link>} />}
    {(resource.status === 'success' || (requestedOrder.status === 'success' && selected)) && <div className="pwc-shop-split">
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
    {requested && requestedOrder.status === 'error' && <Notice state="error" title="Chưa mở được đơn hàng từ thông báo" action={<Button onClick={requestedOrder.retry}>Thử lại</Button>} />}
    {resource.meta?.page && <Pagination {...resource.meta.page} itemLabel="đơn hàng" onPageChange={next => { setPage(next); setSelectedId(null); }} />}
  </section>;
}
