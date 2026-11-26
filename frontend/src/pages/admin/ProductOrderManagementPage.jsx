import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Notice, Button, Pagination } from '../../components/ui/index.js';
import { OrderStatusBadge } from '../../components/product/OrderStatusBadge.jsx';
import { MarkReturningDialog, ConfirmReturnedDialog } from '../../components/product/OrderReturnDialogs.jsx';
import {
  PRODUCT_RECEIVE_LABELS, PRODUCT_PAYMENT_LABELS, PRODUCT_RETURN_REASON_LABELS, PRODUCT_TIER_LABELS, PRODUCT_DELIVERED_BY_LABELS
} from '../../constants/product-labels.js';
import { formatOrderDateTime, formatPhone, formatVnd, isUncertainOutcome, productErrorText, productMessage } from '../../utils/product-format.js';
import { formatCashTime } from '../../utils/counter-sale-format.js';
import '../../components/product/product-shop.css';

const TABS = [
  ['PREPARE', 'Cần chuẩn bị'], ['AWAITING_PICKUP', 'Chờ khách lấy'], ['IN_TRANSIT', 'Đang giao'],
  ['RETURNING', 'Đang hoàn về'], ['ALL', 'Tất cả']
];
const SEARCH_DELAY_MS = 300;
const VIETQR_POLL_MS = 3000;
const readyLinkOf = (order) => (order?.paymentLink?.state === 'READY' && order.paymentLink.checkoutUrl
  ? { checkoutUrl: order.paymentLink.checkoutUrl, expiresAt: order.paymentLink.expiresAt ?? null, orderCode: order.paymentLink.orderCode ?? null }
  : null);

function paymentSummary(order) {
  if (order.paid) return 'Đã thanh toán';
  if (order.paymentMethod === 'COD') return 'Thu khi giao';
  if (order.paymentMethod === 'PREPAID') return 'Chờ thanh toán';
  return order.paymentMethod === 'PAY_AT_SHOP' ? 'Trả khi lấy' : 'Chưa thanh toán';
}

// A prepaid order is prepared only after it is paid; until then it waits for payOS or is cancelled at the payment deadline.
const awaitsPayment = (order) => order.paymentMethod === 'PREPAID' && !order.paid;
const PAYMENT_WAIT_HINT = 'Đơn trả trước qua payOS chưa được thanh toán. Chờ khách thanh toán; quá hạn đơn sẽ tự huỷ và hàng được mở bán lại.';

function PickupShopPayment({ order, busy, run, api, paymentCancelled, onPaid, onClearCancel }) {
  const initialFailed = paymentCancelled || order.paymentLink?.state === 'FAILED';
  const initialLink = initialFailed ? null : readyLinkOf(order);
  const [way, setWay] = useState(initialFailed || initialLink ? 'VIETQR' : 'CASH');
  const [link, setLink] = useState(initialLink);
  const [linkBusy, setLinkBusy] = useState(false);
  const [error, setError] = useState('');
  const polling = useRef(false);

  const failed = paymentCancelled || order.paymentLink?.state === 'FAILED';
  const activeLink = failed ? null : (link ?? readyLinkOf(order));
  const vietqrNotice = error || (failed ? productMessage('MSG32') : '');

  useEffect(() => {
    if (!activeLink || order.paid || typeof api.readOrder !== 'function') return;
    const controller = new AbortController();
    const poll = () => {
      if (polling.current || controller.signal.aborted) return;
      polling.current = true;
      api.readOrder(order.id, { signal: controller.signal }).then((fresh) => {
        if (controller.signal.aborted) return;
        if (fresh.paid || fresh.status !== 'READY' || fresh.paymentLink?.state === 'FAILED') {
          if (fresh.paymentLink?.state === 'FAILED') setLink(null);
          onPaid();
        }
      }).catch(() => {}).finally(() => { polling.current = false; });
    };
    const timer = window.setInterval(poll, VIETQR_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, order.id, order.paid, activeLink, onPaid]);

  async function createLink() {
    if (busy || linkBusy || typeof api.createPaymentLink !== 'function') return;
    setLinkBusy(true); setError('');
    try {
      const next = await api.createPaymentLink(order.id);
      setWay('VIETQR');
      setLink(next);
      onClearCancel();
    } catch (failure) {
      setError(productErrorText(failure));
      if (['ORDER_STATE_CONFLICT', 'ORDER_PAYMENT_IN_PROGRESS'].includes(failure?.code)) onPaid();
    } finally { setLinkBusy(false); }
  }

  return <>
    <p className="pwc-shop-hint">Thu đủ {formatVnd(order.total)} tại cửa hàng trước khi giao hàng cho khách.</p>
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 .5rem', display: 'flex', gap: '1rem' }}>
      <legend className="pwc-visually-hidden">Cách thanh toán tại cửa hàng</legend>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontWeight: 700 }}>
        <input type="radio" name={`pickup-pay-${order.id}`} value="CASH" checked={way === 'CASH'}
          disabled={busy || linkBusy} onChange={() => { setWay('CASH'); setError(''); }} />Tiền mặt
      </label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontWeight: 700 }}>
        <input type="radio" name={`pickup-pay-${order.id}`} value="VIETQR" checked={way === 'VIETQR'}
          disabled={busy || linkBusy} onChange={() => { setWay('VIETQR'); setError(''); }} />VietQR
      </label>
    </fieldset>
    {way === 'CASH' && (
      <button type="button" className="pwc-shop-outline-button" disabled={busy || linkBusy}
        onClick={() => run(() => api.recordPayment(order.id))}>Đã thu tiền</button>
    )}
    {way === 'VIETQR' && <>
      {vietqrNotice && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{vietqrNotice}</p>}
      {activeLink ? <div className="pwc-shop-panel" role="status" style={{ padding: '.75rem', marginBottom: '.5rem' }}>
        <p style={{ margin: '0 0 .35rem' }}><strong>Mã VietQR payOS đã sẵn sàng</strong>
          {activeLink.expiresAt && <span> · hiệu lực đến {formatCashTime(activeLink.expiresAt)}</span>}</p>
        {activeLink.orderCode && <p className="pwc-shop-hint" style={{ margin: '0 0 .35rem' }}>Mã giao dịch payOS: <strong>{activeLink.orderCode}</strong></p>}
        <p className="pwc-shop-hint" style={{ margin: '0 0 .5rem' }}>Mở trang payOS cho khách quét mã. Màn hình tự cập nhật khi payOS xác nhận đã thanh toán.</p>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <a className="pwc-shop-primary-button" style={{ textAlign: 'center', textDecoration: 'none' }}
            href={activeLink.checkoutUrl}>Mở trang VietQR payOS</a>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            <button type="button" className="pwc-shop-outline-button" disabled={busy || linkBusy} onClick={onPaid}>Kiểm tra thanh toán</button>
            <button type="button" className="pwc-shop-outline-button" disabled={busy || linkBusy} onClick={createLink}>Tạo mã VietQR mới</button>
          </div>
        </div>
      </div> : (
        <button type="button" className="pwc-shop-outline-button" disabled={busy || linkBusy} onClick={createLink}>
          {linkBusy ? 'Đang tạo mã…' : failed ? 'Tạo mã VietQR mới' : 'Tạo mã VietQR'}
        </button>
      )}
    </>}
  </>;
}

// Which step the Admin can take next depends only on the receive method and the status the backend reports.
// `inline` keeps an error in the dialog that asked for the change instead of on the page behind it.
function OrderActions({ order, busy, run, api, paymentCancelled, onRefresh, onClearCancel }) {
  const [trackingCode, setTrackingCode] = useState('');
  const [dialog, setDialog] = useState(null);
  const submitFrom = (operation) => async (values) => {
    const failure = await run(() => operation(values), { inline: true });
    if (!failure) setDialog(null);
    return failure;
  };
  if (awaitsPayment(order) && order.status === 'PLACED') {
    return <div className="pwc-shop-actions"><p className="pwc-shop-hint">{PAYMENT_WAIT_HINT}</p></div>;
  }
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
  if (order.receiveMethod === 'DELIVERY' && order.status === 'HANDED_TO_CARRIER') {
    return <div className="pwc-shop-actions">
      <p className="pwc-shop-hint">Cập nhật theo kết quả giao hàng mà hãng vận chuyển báo.</p>
      <button type="button" className="pwc-shop-primary-button" disabled={busy}
        onClick={() => run(() => api.markDelivered(order.id))}>Đã giao hàng</button>
      <button type="button" className="pwc-shop-outline-button" disabled={busy} onClick={() => setDialog('returning')}>Đang hoàn về</button>
      {dialog === 'returning' && <MarkReturningDialog order={order} onClose={() => setDialog(null)}
        onSubmit={submitFrom((carrierReason) => api.markReturning(order.id, carrierReason))} />}
    </div>;
  }
  if (order.status === 'BEING_RETURNED') {
    return <div className="pwc-shop-actions">
      <p className="pwc-shop-hint">Khi hàng hoàn về đến cửa hàng, kiểm hàng rồi xác nhận số lượng bán lại được.</p>
      <button type="button" className="pwc-shop-primary-button" disabled={busy} onClick={() => setDialog('confirm')}>Xác nhận đã hoàn về</button>
      {dialog === 'confirm' && <ConfirmReturnedDialog order={order} onClose={() => setDialog(null)}
        onSubmit={submitFrom((values) => api.confirmReturned(order.id, values))} />}
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
      {!order.paid && order.paymentMethod !== 'PREPAID' && (
        <PickupShopPayment order={order} busy={busy} run={run} api={api}
          paymentCancelled={paymentCancelled} onPaid={onRefresh} onClearCancel={onClearCancel} />
      )}
      <button type="button" className="pwc-shop-primary-button" disabled={busy}
        onClick={() => run(() => api.handToCustomer(order.id))}>Giao cho khách</button>
    </div>;
  }
  return null;
}

function OrderDetail({ order, busy, run, api, paymentCancelled, onRefresh, onClearCancel }) {
  const collectsOnDelivery = order.paymentMethod === 'COD' && !order.paid;
  const paymentStateText = order.paid
    ? (order.paymentMethod === 'PAY_AT_SHOP' && order.vietqrPaid ? 'đã thu (VietQR)' : 'đã thu')
    : 'chưa thu';
  return <aside className="pwc-shop-panel" aria-label={`Chi tiết đơn ${order.code}`}>
    <h2>Đơn {order.code} <OrderStatusBadge status={order.status} forAdmin /></h2>
    <dl className="pwc-shop-facts">
      <dt>Khách hàng</dt><dd>{order.customer.displayName ?? 'Khách hàng'}</dd>
      <dt>Số điện thoại</dt><dd>{order.customer.phone ? formatPhone(order.customer.phone) : 'Chưa có'}</dd>
      <dt>Cách nhận</dt><dd>{PRODUCT_RECEIVE_LABELS[order.receiveMethod]}</dd>
      {order.deliveryAddress && <><dt>Địa chỉ</dt><dd>{order.deliveryAddress.location}</dd></>}
      <dt>Thanh toán</dt><dd>{PRODUCT_PAYMENT_LABELS[order.paymentMethod].title} · {paymentStateText}</dd>
      {order.paymentMethod === 'PREPAID' && order.paymentDeadlineAt && !order.paid && order.status === 'PLACED'
        && <><dt>Hạn thanh toán</dt><dd>{formatOrderDateTime(order.paymentDeadlineAt)}</dd></>}
      {order.trackingCode && <><dt>Mã vận đơn</dt><dd>{order.trackingCode}</dd></>}
      {order.status === 'DELIVERED' && order.deliveredBy && (
        <><dt>Xác nhận giao</dt><dd>{PRODUCT_DELIVERED_BY_LABELS[order.deliveredBy] ?? order.deliveredBy}</dd></>
      )}
      {order.carrierReturnReason && <><dt>Lý do của hãng</dt><dd>{order.carrierReturnReason}</dd></>}
      {order.returnReason && <><dt>Lý do hoàn về</dt><dd>{PRODUCT_RETURN_REASON_LABELS[order.returnReason] ?? order.returnReason}</dd></>}
      {order.returnNote && <><dt>Ghi chú</dt><dd>{order.returnNote}</dd></>}
      {order.refundMarked && <><dt>Hoàn tiền</dt><dd>{Number.isSafeInteger(order.refundAmountVnd)
        ? `Cần hoàn ${formatVnd(order.refundAmountVnd)} cho khách (thanh toán trước qua payOS). Kế toán hoàn ngoài hệ thống.`
        : 'Cần hoàn lại tiền thanh toán trước cho khách'}</dd></>}
    </dl>
    <div style={{ borderTop: '1px solid var(--shop-border)', marginTop: '1rem', paddingTop: '.75rem' }}>
      {order.lines.map((line) => <div key={line.productId} className="pwc-shop-summary-row">
        <span>{line.productName} × {line.quantity}{typeof line.resellableQuantity === 'number' && ` · bán lại được ${line.resellableQuantity}`}</span><strong>{formatVnd(line.lineTotal)}</strong></div>)}
      <div className="pwc-shop-summary-row"><span>Tạm tính</span><span>{formatVnd(order.subtotal)}</span></div>
      {order.tierDiscount > 0 && <div className="pwc-shop-summary-row">
        <span>Giảm giá hạng {PRODUCT_TIER_LABELS[order.tierCode]}</span><span>− {formatVnd(order.tierDiscount)}</span></div>}
      {order.receiveMethod === 'DELIVERY' && <div className="pwc-shop-summary-row"><span>Phí giao hàng</span><span>{formatVnd(order.shippingFee)}</span></div>}
      <div className="pwc-shop-summary-row pwc-shop-summary-total"><span>{collectsOnDelivery ? 'Tổng thu khi giao' : 'Tổng'}</span><strong>{formatVnd(order.total)}</strong></div>
    </div>
    <OrderActions key={order.id} order={order} busy={busy} run={run} api={api}
      paymentCancelled={paymentCancelled} onRefresh={onRefresh} onClearCancel={onClearCancel} />
  </aside>;
}

// Order Management for Admin. The backend owns every status change and stock effect; this page only asks for them.
export function ProductOrderManagementPage({ api }) {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const requestedOrderId = params.get('order');
  const paymentCancelled = params.get('cancel') === 'true'
    || ['CANCELLED', 'FAILED'].includes((params.get('status') ?? '').toUpperCase());
  const tab = TABS.some(([key]) => key === requestedTab) ? requestedTab : 'PREPARE';
  const [viewTab, setViewTab] = useState(tab);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(requestedOrderId);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const clearCancelParams = useCallback(() => {
    if (!params.get('cancel') && !params.get('status')) return;
    const next = new globalThis.URLSearchParams(params);
    next.delete('cancel');
    next.delete('status');
    setParams(next, { replace: true });
  }, [params, setParams]);

  function resetTabView() {
    setPage(1);
    setSelectedId(null);
    setNotice(null);
  }

  if (tab !== viewTab) {
    setViewTab(tab);
    resetTabView();
  }

  function selectTab(key) {
    if (key === tab) resetTabView();
    const next = new globalThis.URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const load = useCallback(({ signal }) => api.listOrders({ tab, search, page }, { signal }), [api, tab, search, page]);
  const resource = useApiResource(load);
  const orders = resource.data ?? [];
  const counts = resource.meta?.counts;
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];

  // Resolves to null when the change was applied, or to the error text when it was not.
  async function run(operation, { inline = false } = {}) {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setNotice(null);
    try {
      const updated = await operation();
      setNotice({ kind: 'ok', text: productMessage('MSG106', { code: updated.code }) });
      resource.retry();
      return null;
    } catch (error) {
      const text = productErrorText(error);
      if (!inline) setNotice({ kind: 'error', text });
      // The order may have changed under us, or the answer was lost: show what the backend now holds.
      if (error?.code === 'ORDER_STATE_CONFLICT' || isUncertainOutcome(error)) resource.retry();
      return text;
    } finally { lock.current = false; setBusy(false); }
  }

  return <section className="pwc-shop" aria-labelledby="order-management-title">
    <h1 id="order-management-title">Đơn hàng</h1>
    <p className="pwc-shop-lead">Chuẩn bị, giao và theo dõi đơn hàng online.</p>
    <div className="pwc-shop-chip-row" role="group" aria-label="Lọc đơn theo trạng thái">
      {TABS.map(([key, label]) => <button key={key} type="button" className="pwc-shop-chip" aria-pressed={tab === key}
        onClick={() => selectTab(key)}>
        {label}{key !== 'ALL' && counts ? ` (${counts[key]})` : ''}</button>)}
    </div>
    <input type="search" className="pwc-shop-search" style={{ margin: '1rem 0' }} value={searchText} maxLength={100}
      aria-label="Tìm theo mã đơn, tên khách hoặc số điện thoại" placeholder="Tìm theo mã đơn, tên khách hoặc số điện thoại"
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
      {selected && <OrderDetail order={selected} busy={busy} run={run} api={api}
        paymentCancelled={Boolean(paymentCancelled && (!requestedOrderId || selected.id === requestedOrderId))}
        onRefresh={resource.retry} onClearCancel={clearCancelParams} />}
    </div>}
    {resource.meta?.page && <Pagination {...resource.meta.page} itemLabel="đơn hàng" disabled={busy}
      onPageChange={next => { setPage(next); setSelectedId(null); }} />}
  </section>;
}
