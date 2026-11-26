import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { usePhoneApp } from '../../hooks/usePhoneApp.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button, Dialog, Pagination, Toast } from '../../components/ui/index.js';
import { OrderStatusBadge } from '../../components/product/OrderStatusBadge.jsx';
import { PRODUCT_RECEIVE_LABELS, PRODUCT_PAYMENT_LABELS, PRODUCT_TIER_LABELS } from '../../constants/product-labels.js';
import { formatOrderDate, formatOrderDateTime, formatVnd, productErrorText, productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

const PAYOS_CHECKOUT = /^https:\/\/pay\.payos\.vn\/web\//u;

// A prepaid order that is placed, not paid and not yet late can be paid (again) on the payOS page (UC-62 steps 7-8).
const payable = (order) => order.paymentMethod === 'PREPAID' && order.status === 'PLACED' && !order.paid
  && Date.parse(order.paymentDeadlineAt) > Date.now();

function PaymentStatus({ order, api, notice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pay() {
    setBusy(true); setError('');
    try {
      const { checkoutUrl } = await api.createPaymentLink(order.id);
      if (!PAYOS_CHECKOUT.test(checkoutUrl)) throw new Error('unexpected payment page');
      window.location.assign(checkoutUrl);
    } catch (failure) {
      setError(productErrorText(failure));
      setBusy(false);
    }
  }
  if (order.paid) return <span className="pwc-shop-status pwc-shop-status--done">Đã thanh toán</span>;
  if (order.paymentMethod !== 'PREPAID') return <span className="pwc-shop-status pwc-shop-status--muted">Chưa thanh toán</span>;
  if (order.status === 'CANCELLED') {
    return <span className="pwc-shop-status pwc-shop-status--muted">
      {order.cancelledBy === 'CUSTOMER' || order.cancelledBy === 'STAFF'
        ? 'Đã huỷ (chưa thanh toán)'
        : 'Đã huỷ vì quá hạn thanh toán'}
    </span>;
  }
  return <>
    <span className="pwc-shop-status pwc-shop-status--warn">Chờ thanh toán</span>
    {order.paymentDeadlineAt && <p className="pwc-shop-hint">Thanh toán trước {formatOrderDateTime(order.paymentDeadlineAt)}.</p>}
    {notice && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{notice}</p>}
    {error && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{error}</p>}
    {payable(order) && <button type="button" className="pwc-shop-primary-button" disabled={busy} onClick={pay}>
      {busy ? 'Đang mở trang thanh toán…' : 'Thanh toán qua payOS'}</button>}
  </>;
}

function cancelKey(orderId) {
  return `cust-cancel-${orderId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function OrderDetail({ order, api, notice, onCancelled, onRefresh }) {
  const { pathname, search } = useLocation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const keyRef = useRef(null);

  useEffect(() => {
    setConfirmOpen(false);
    setCancelError('');
    keyRef.current = null;
  }, [order.id]);

  async function confirmCancel() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCancelError('');
    if (!keyRef.current) keyRef.current = cancelKey(order.id);
    try {
      const updated = await api.cancelOrder(order.id, { idempotencyKey: keyRef.current });
      keyRef.current = null;
      setConfirmOpen(false);
      onCancelled?.(updated);
    } catch (failure) {
      setConfirmOpen(false);
      if (failure?.code === 'ORDER_NOT_CANCELLABLE') {
        keyRef.current = null;
        setCancelError(productMessage('MSG156'));
        onRefresh?.();
      } else {
        setCancelError(productErrorText(failure));
      }
    } finally {
      setCancelBusy(false);
    }
  }

  return <aside className="pwc-shop-panel pwc-shop-orders-panel" aria-label={`Chi tiết đơn ${order.code}`}>
    <p><Link to="/contact" state={{ helpFrom: pathname + search }}>Hỗ trợ đơn mua</Link></p>
    <h2>Đơn {order.code} <OrderStatusBadge status={order.status} /></h2>
    <dl className="pwc-shop-facts">
      <dt>Ngày đặt</dt><dd>{formatOrderDate(order.createdAt)}</dd>
      <dt>Cách nhận</dt><dd>{PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</dd>
      {order.deliveryAddress && <><dt>Địa chỉ</dt><dd>{order.deliveryAddress.location}</dd></>}
      <dt>Thanh toán</dt><dd>{PRODUCT_PAYMENT_LABELS[order.paymentMethod].title}<br />
        <PaymentStatus order={order} api={api} notice={notice} /></dd>
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
    {order.status === 'CANCELLED' && order.paymentMethod === 'PREPAID' && order.paid && (
      <p className="pwc-shop-hint" style={{ marginTop: '.75rem' }}>
        Đơn đã thanh toán trước sẽ được Paw World hoàn đủ <strong>{formatVnd(order.total)}</strong> ngoài hệ thống.
      </p>
    )}
    {cancelError && !['HANDED_TO_CARRIER', 'READY'].includes(order.status) && (
      <p className="pwc-shop-alert pwc-shop-alert--error" role="alert" style={{ marginTop: '.75rem' }}>{cancelError}</p>
    )}
    {order.status === 'PLACED' && <div style={{ marginTop: '1rem' }}>
      <Button type="button" variant="danger" disabled={cancelBusy} onClick={() => { setCancelError(''); setConfirmOpen(true); }}>
        Huỷ đơn
      </Button>
    </div>}
    {['HANDED_TO_CARRIER', 'READY'].includes(order.status) && (
      <p className="pwc-shop-hint" role="status" style={{ marginTop: '1rem' }}>{productMessage('MSG156')}</p>
    )}
    <Dialog open={confirmOpen} onClose={() => !cancelBusy && setConfirmOpen(false)} title="Xác nhận huỷ đơn hàng"
      footer={<>
        <Button type="button" variant="secondary" disabled={cancelBusy} onClick={() => setConfirmOpen(false)}>Quay lại</Button>
        <Button type="button" variant="danger" loading={cancelBusy} onClick={confirmCancel}>Xác nhận huỷ</Button>
      </>}>
      <p>{productMessage('MSG154', { code: order.code })}</p>
    </Dialog>
  </aside>;
}

export function MyProductOrdersPage() {
  const { api } = useProductCart();
  const compact = usePhoneApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = /^[a-f0-9]{24}$/i.test(params.get('order') ?? '') ? params.get('order') : null;
  const [toastMessage, setToastMessage] = useState('');
  const [linkErrorNotice, setLinkErrorNotice] = useState(null);
  const shownPaidReturn = useRef(null);
  const dismissToast = useCallback(() => setToastMessage(''), []);
  // payOS sends the customer back with cancel=true when the payment was cancelled on its page (MSG32). The return
  // itself proves nothing: only the payOS result the shop receives marks an order paid. MSG33 comes from the checkout.
  const noticeFor = (order) => (order.id === requested && params.get('cancel') === 'true' ? productMessage('MSG32')
    : (linkErrorNotice?.code === order.code ? linkErrorNotice.message : '')
      || (order.code === location.state?.placed && location.state?.paymentLinkError) || '');
  const [desktopPage, setDesktopPage] = useState(1);
  const page = compact ? Math.max(1, Number.parseInt(params.get('page'), 10) || 1) : desktopPage;
  const listUrl = page > 1 ? `/customer/product-orders?page=${page}` : '/customer/product-orders';
  const load = useCallback(({ signal }) => api.listOrders({ signal, page }), [api, page]);
  const resource = useApiResource(load);
  const [selectedId, setSelectedId] = useState(requested);
  useEffect(() => { setSelectedId(requested); }, [requested]);
  const loadRequested = useCallback(({ signal }) => requested ? api.getOrder(requested, { signal }) : Promise.resolve({ data: null }), [api, requested]);
  const requestedOrder = useApiResource(loadRequested);
  const orders = resource.data ?? [];
  const selected = orders.find((order) => order.id === selectedId) ?? (requestedOrder.data?.id === requested ? requestedOrder.data : null) ?? (!requested ? orders[0] : null);

  // Show MSG59 once as an auto-hiding toast after checkout, then clear location.state so reload/back never repeats it.
  useEffect(() => {
    const placedCode = location.state?.placed;
    if (!placedCode) return;
    setToastMessage(productMessage('MSG59', { code: placedCode }));
    if (location.state?.paymentLinkError) {
      setLinkErrorNotice({ code: placedCode, message: location.state.paymentLinkError });
    }
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  // Back from payOS after paying (UC-62 step 8): MSG59 once the order itself says it is paid, then strip status from URL.
  const paidReturn = selected?.id === requested && selected.paid && selected.paymentMethod === 'PREPAID' && params.get('status') === 'PAID';
  useEffect(() => {
    if (!paidReturn || shownPaidReturn.current === selected.id) return;
    shownPaidReturn.current = selected.id;
    setToastMessage(productMessage('MSG59', { code: selected.code }));
    const next = new globalThis.URLSearchParams(params);
    next.delete('status');
    setParams(next, { replace: true });
  }, [paidReturn, selected?.id, selected?.code, params, setParams]);

  const refreshOrders = useCallback(() => {
    resource.retry();
    if (requested) requestedOrder.retry();
  }, [resource, requestedOrder, requested]);

  const handleOrderCancelled = useCallback((updated) => {
    setToastMessage(productMessage('MSG155', { code: updated.code }));
    refreshOrders();
  }, [refreshOrders]);

  if (compact && requested) return <section className="pwc-shop" aria-labelledby="orders-title">
    <h1 id="orders-title" data-duplicate-title>Chi tiết đơn mua</h1>
    <Link data-page-back to={listUrl}>Về đơn mua hàng</Link>
    <Toast message={toastMessage} onClose={dismissToast} />
    {selected?.id === requested ? <OrderDetail order={selected} api={api} notice={noticeFor(selected)}
      onCancelled={handleOrderCancelled} onRefresh={refreshOrders} /> : requestedOrder.status === 'loading'
      ? <Notice state="loading" title="Đang tải chi tiết đơn…" />
      : <Notice state="error" title="Chưa mở được chi tiết đơn" action={<Button onClick={requestedOrder.retry}>Thử lại</Button>} />}
  </section>;

  return <section className="pwc-shop" aria-labelledby="orders-title">
    <h1 id="orders-title" data-duplicate-title>Đơn mua sản phẩm</h1>
    <p className="pwc-shop-lead">Các đơn mua sản phẩm của bạn. Chọn một đơn để xem chi tiết.</p>
    <Toast message={toastMessage} onClose={dismissToast} />
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn hàng…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được đơn hàng"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'empty' && !requested && <Notice state="empty" title={productMessage('MSG102')}
      action={<Link className="pwc-compact-cta" to="/products">Khám phá cửa hàng</Link>}>
      Bạn có thể theo dõi đơn sản phẩm tại đây sau khi đặt hàng.
    </Notice>}
    {compact && resource.status === 'success' && <ul className="pwc-mobile-rows">
      {orders.map(order => <li key={order.id}>
        <strong>{order.code}</strong> <OrderStatusBadge status={order.status} />
        <p>{formatOrderDate(order.createdAt)} · {PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</p>
        <p>{formatVnd(order.total)}</p>
        <Link to={{ pathname: '/customer/product-orders', search: new globalThis.URLSearchParams({ order: order.id, page }).toString() }}
          state={{ mobileBack: listUrl }}>Xem đơn {order.code}</Link>
      </li>)}
    </ul>}
    {!compact && (resource.status === 'success' || (requestedOrder.status === 'success' && selected)) && <div className="pwc-shop-split pwc-shop-split--orders">
      <div className="pwc-shop-panel pwc-shop-orders-panel pwc-shop-table-wrap">
        <table className="pwc-shop-table pwc-shop-table--orders">
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
      {selected && <OrderDetail order={selected} api={api} notice={noticeFor(selected)}
        onCancelled={handleOrderCancelled} onRefresh={refreshOrders} />}
    </div>}
    {requested && requestedOrder.status === 'error' && <Notice state="error" title="Chưa mở được đơn hàng từ thông báo" action={<Button onClick={requestedOrder.retry}>Thử lại</Button>} />}
    {resource.meta?.page && (page > 1 || orders.length > 0) && <Pagination {...resource.meta.page} itemLabel="đơn hàng" onPageChange={next => {
      if (compact) setParams(next > 1 ? { page: String(next) } : {});
      else setDesktopPage(next);
      setSelectedId(null);
    }} />}
  </section>;
}
