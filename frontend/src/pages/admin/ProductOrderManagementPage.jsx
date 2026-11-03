import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Notice, Button } from '../../components/ui/index.js';
import { OrderStatusBadge } from '../../components/product/OrderStatusBadge.jsx';
import { PRODUCT_RECEIVE_LABELS, PRODUCT_PAYMENT_LABELS } from '../../constants/product-labels.js';
import { formatVnd, isUncertainOutcome, productErrorText, productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

const TABS = [
  ['PREPARE', 'Cần chuẩn bị'], ['AWAITING_PICKUP', 'Chờ khách lấy'], ['IN_TRANSIT', 'Đang giao'],
  ['RETURNING', 'Đang hoàn về'], ['ALL', 'Tất cả']
];
const SEARCH_DELAY_MS = 300;

function paymentSummary(order) {
  if (order.paid) return 'Đã thanh toán';
  return order.paymentMethod === 'COD' ? 'Thu khi giao' : 'Trả khi lấy';
}

// Which step the Admin can take next depends only on the receive method and the status the backend reports.
function OrderActions({ order, busy, run, api }) {
  const [trackingCode, setTrackingCode] = useState('');
  if (order.receiveMethod === 'DELIVERY' && order.status === 'PLACED') {
    return <div className="pwc-shop-actions">
      <label htmlFor="tracking-code"><strong>Mã vận đơn</strong></label>
      <input id="tracking-code" className="pwc-shop-field" value={trackingCode} maxLength={64} autoComplete="off"
        onChange={(event) => setTrackingCode(event.target.value)} />
      <p className="pwc-shop-hint">Đặt giao hàng trên trang của hãng vận chuyển, nhập mã vận đơn rồi giao kiện cho hãng.</p>
      <button type="button" className="pwc-shop-primary-button" disabled={busy}
        onClick={() => run(() => api.handToCarrier(order.id, trackingCode))}>Đã giao cho hãng vận chuyển</button>
    </div>;
  }
  if (order.receiveMethod === 'PICKUP' && order.status === 'PLACED') {
    return <div className="pwc-shop-actions">
      <p className="pwc-shop-hint">Chuẩn bị hàng rồi đánh dấu sẵn sàng để khách đến lấy.</p>
      <button type="button" className="pwc-shop-primary-button" disabled={busy}
        onClick={() => run(() => api.markReady(order.id))}>Đánh dấu sẵn sàng</button>
    </div>;
  }
  if (order.receiveMethod === 'PICKUP' && order.status === 'READY') {
    return <div className="pwc-shop-actions">
      {!order.paid && <>
        <p className="pwc-shop-hint">Thu đủ {formatVnd(order.total)} tại cửa hàng trước khi giao hàng cho khách.</p>
        <button type="button" className="pwc-shop-outline-button" disabled={busy}
          onClick={() => run(() => api.recordPayment(order.id))}>Đã thu tiền</button>
      </>}
      <button type="button" className="pwc-shop-primary-button" disabled={busy}
        onClick={() => run(() => api.handToCustomer(order.id))}>Giao cho khách</button>
    </div>;
  }
  return null;
}

function OrderDetail({ order, busy, run, api }) {
  const collectsOnDelivery = order.paymentMethod === 'COD' && !order.paid;
  return <aside className="pwc-shop-panel" aria-label={`Chi tiết đơn ${order.code}`}>
    <h2>Đơn {order.code} <OrderStatusBadge status={order.status} /></h2>
    <dl className="pwc-shop-facts">
      <dt>Khách hàng</dt><dd>{order.customer.displayName ?? 'Khách hàng'}</dd>
      <dt>Cách nhận</dt><dd>{PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</dd>
      {order.deliveryAddress && <><dt>Địa chỉ</dt><dd>{order.deliveryAddress.location}</dd></>}
      <dt>Thanh toán</dt><dd>{PRODUCT_PAYMENT_LABELS[order.paymentMethod].title} · {order.paid ? 'đã thu' : 'chưa thu'}</dd>
      {order.trackingCode && <><dt>Mã vận đơn</dt><dd>{order.trackingCode}</dd></>}
    </dl>
    <div style={{ borderTop: '1px solid var(--shop-border)', marginTop: '1rem', paddingTop: '.75rem' }}>
      {order.lines.map((line) => <div key={line.productId} className="pwc-shop-summary-row">
        <span>{line.productName} × {line.quantity}</span><strong>{formatVnd(line.lineTotal)}</strong></div>)}
      {order.receiveMethod === 'DELIVERY' && <div className="pwc-shop-summary-row"><span>Phí giao hàng</span><span>{formatVnd(order.shippingFee)}</span></div>}
      <div className="pwc-shop-summary-row pwc-shop-summary-total"><span>{collectsOnDelivery ? 'Tổng thu khi giao' : 'Tổng'}</span><strong>{formatVnd(order.total)}</strong></div>
    </div>
    <OrderActions key={order.id} order={order} busy={busy} run={run} api={api} />
  </aside>;
}

// Order Management for Admin. The backend owns every status change and stock effect; this page only asks for them.
export function ProductOrderManagementPage({ api }) {
  const [tab, setTab] = useState('PREPARE');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const load = useCallback(({ signal }) => api.listOrders({ tab, search }, { signal }), [api, tab, search]);
  const resource = useApiResource(load);
  const orders = resource.data ?? [];
  const counts = resource.meta?.counts;
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];

  async function run(operation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice(null);
    try {
      const updated = await operation();
      setNotice({ kind: 'ok', text: productMessage('MSG106', { code: updated.code }) });
      resource.retry();
    } catch (error) {
      setNotice({ kind: 'error', text: productErrorText(error) });
      // The order may have changed under us, or the answer was lost: show what the backend now holds.
      if (error?.code === 'ORDER_STATE_CONFLICT' || isUncertainOutcome(error)) resource.retry();
    } finally { lock.current = false; setBusy(false); }
  }

  return <section className="pwc-shop" aria-labelledby="order-management-title">
    <h1 id="order-management-title">Đơn hàng</h1>
    <p className="pwc-shop-lead">Chuẩn bị, giao và theo dõi đơn hàng online.</p>
    <div className="pwc-shop-chip-row" role="group" aria-label="Lọc đơn theo trạng thái">
      {TABS.map(([key, label]) => <button key={key} type="button" className="pwc-shop-chip" aria-pressed={tab === key}
        onClick={() => { setTab(key); setNotice(null); }}>
        {label}{key !== 'ALL' && counts ? ` (${counts[key]})` : ''}</button>)}
    </div>
    <input type="search" className="pwc-shop-search" style={{ margin: '1rem 0' }} value={searchText} maxLength={100}
      aria-label="Tìm theo mã đơn hoặc tên khách" placeholder="Tìm theo mã đơn hoặc tên khách"
      onChange={(event) => setSearchText(event.target.value)} />
    {notice && <p className={`pwc-shop-alert pwc-shop-alert--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn hàng…" />}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Bạn không có quyền xử lý đơn hàng." />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được đơn hàng"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'empty' && <Notice state="empty" title="Không có đơn hàng nào trong mục này." />}
    {resource.status === 'success' && <div className="pwc-shop-split">
      <div className="pwc-shop-panel pwc-shop-table-wrap">
        <table className="pwc-shop-table pwc-shop-table--wide">
          <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Cách nhận</th><th>Thanh toán</th><th>Tổng tiền</th><th><span className="pwc-visually-hidden">Xem</span></th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.id} className={order.id === selected?.id ? 'is-selected' : undefined}>
            <td><strong>{order.code}</strong></td><td>{order.customer.displayName ?? 'Khách hàng'}</td>
            <td>{PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</td><td>{paymentSummary(order)}</td>
            <td><strong>{formatVnd(order.total)}</strong></td>
            <td><button type="button" className="pwc-shop-link-button" aria-label={`Xem đơn ${order.code}`}
              aria-pressed={order.id === selected?.id} onClick={() => setSelectedId(order.id)}>Xem</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {selected && <OrderDetail order={selected} busy={busy} run={run} api={api} />}
    </div>}
  </section>;
}
