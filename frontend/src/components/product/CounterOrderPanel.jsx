import { Check } from 'lucide-react';
import { QuantityStepper } from './QuantityStepper.jsx';
import { COUNTER_STATUS_LABELS, COUNTER_LIMITS } from '../../constants/counter-sale.js';
import { PRODUCT_TIER_LABELS } from '../../constants/product-labels.js';
import { formatVnd } from '../../utils/product-format.js';
import { formatCashTime } from '../../utils/counter-sale-format.js';
import { Notice, Button } from '../ui/index.js';

export function CounterOrderPanel({ sale }) {
  const { order, preview, previewState, lines, busy, locked, readState } = sale;
  const shown = order?.lines ?? lines, totals = order ?? (previewState === 'success' ? preview : null);
  const terminal = order && ['COMPLETED', 'CANCELLED'].includes(order.status);
  const customer = order ? order.customer : sale.customer;
  const tierLabel = PRODUCT_TIER_LABELS[totals?.tierCode ?? customer?.tierCode];
  const showCustomerLookup = !order || !customer;
  return <section className="pwc-shop-panel counter-order" aria-labelledby="counter-order-title">
    <div className="counter-order-heading"><h2 id="counter-order-title">{order ? `Đơn ${order.code}` : 'Đơn tại quầy'}</h2>
      {order && <span className={`counter-status counter-status--${order.status.toLowerCase()}`}>{COUNTER_STATUS_LABELS[order.status]}</span>}</div>
    {readState === 'loading' && <Notice state="loading" title="Đang mở đơn…" />}
    {['error', 'forbidden'].includes(readState) && <Notice state={readState} title="Chưa mở được đơn" action={<Button onClick={sale.retry}>Thử lại</Button>} />}
    {showCustomerLookup && <><label className="pwc-shop-label" htmlFor="counter-contact">Số điện thoại hoặc email của khách (không bắt buộc)</label>
    <div className="counter-customer-search"><input id="counter-contact" className="pwc-shop-field" value={sale.contact} maxLength={COUNTER_LIMITS.contact}
      autoComplete="off" disabled={locked} aria-describedby={sale.lookupText ? 'counter-contact-note' : undefined}
      onChange={event => sale.changeContact(event.target.value)} />
      <button type="button" className="pwc-shop-outline-button" disabled={locked || sale.lookupBusy} onClick={sale.lookup}>{sale.lookupBusy ? 'Đang tìm…' : 'Tìm'}</button></div>
    {sale.lookupText && <p id="counter-contact-note" className="pwc-shop-hint" role="status">{sale.lookupText}</p>}</>}
    {customer && <p className="counter-customer"><Check size={18} aria-hidden="true" /><span>{customer.displayName}{tierLabel && ` · hạng ${tierLabel}`}</span></p>}
    {!shown.length && <p className="counter-empty pwc-shop-hint">Thêm sản phẩm để tạo đơn tại quầy.</p>}
    <div className="counter-lines">{shown.map(line => {
      const quoted = previewState === 'success' ? preview?.lines.find(item => item.productId === line.productId) : null;
      return <div className="counter-line" key={line.productId}>
        <div className="counter-line-name"><strong>{line.productName}</strong><small>{line.productCode}</small></div>
        <QuantityStepper value={line.quantity} max={line.available ?? COUNTER_LIMITS.quantity} label={`Số lượng ${line.productName}`}
          disabled={locked} onChange={value => sale.change(line, value)} onLimit={() => sale.limit(line)} />
        <strong className="counter-line-total">{formatVnd(order ? line.lineTotal : quoted?.lineTotal) || '—'}</strong>
        {!order && <button type="button" className="pwc-shop-link-button" aria-label={`Bỏ ${line.productName}`} disabled={locked} onClick={() => sale.remove(line.productId)}>Bỏ</button>}
        {!order && sale.lineNotices?.[line.productId] && <p className="counter-line-error" role="alert">{sale.lineNotices[line.productId]}</p>}
      </div>;
    })}</div>
    {!order && previewState === 'loading' && <p className="pwc-shop-hint" role="status">Đang tính tổng…</p>}
    {!order && previewState === 'error' && <button type="button" className="pwc-shop-link-button" onClick={sale.retry}>Tính lại tổng</button>}
    <div className="counter-totals">
      <div className="pwc-shop-summary-row"><span>Tạm tính</span><strong>{totals ? formatVnd(totals.subtotal) : '—'}</strong></div>
      <div className="pwc-shop-summary-row" data-testid="counter-discount"><span>{tierLabel ? `Giảm giá hạng ${tierLabel}` : 'Giảm theo hạng'}</span>
        <strong>{totals ? (totals.tierDiscount > 0 ? '− ' : '') + formatVnd(totals.tierDiscount) : '—'}</strong></div>
      <div className="pwc-shop-summary-row pwc-shop-summary-total counter-total"><span>Tổng</span><strong>{totals ? formatVnd(totals.total) : '—'}</strong></div>
    </div>
    <fieldset className="counter-payment"><legend>Cách thanh toán</legend>
      <label><input type="radio" name="counter-payment" value="CASH" checked={sale.paymentWay === 'CASH'}
        disabled={busy || (Boolean(order) && order.status !== 'AWAITING_PAYMENT')}
        onChange={() => sale.changePaymentWay('CASH')} />Tiền mặt</label>
      <label><input type="radio" name="counter-payment" value="VIETQR" checked={sale.paymentWay === 'VIETQR'}
        disabled={busy || (Boolean(order) && order.status !== 'AWAITING_PAYMENT')}
        onChange={() => sale.changePaymentWay('VIETQR')} />VietQR</label>
    </fieldset>
    {order?.cashPayment && <p className="counter-cash" role="status">Đã nhận {formatVnd(order.cashPayment.amount)} tiền mặt lúc {formatCashTime(order.cashPayment.receivedAt)}</p>}
    {!order?.cashPayment && order?.vietqrPayment && <p className="counter-cash" role="status">Đã nhận {formatVnd(order.vietqrPayment.amount)} qua VietQR lúc {formatCashTime(order.vietqrPayment.paidAt)}</p>}
    <div className="counter-actions">
      {!order && <button type="button" className="pwc-shop-primary-button" disabled={busy || sale.lookupBusy || (!sale.uncertain && (locked || !lines.length || previewState !== 'success' || readState !== 'success'))}
        onClick={sale.create}>{sale.uncertain ? 'Thử lại tạo đơn' : busy ? 'Đang tạo…' : 'Tạo đơn'}</button>}
      {order?.status === 'AWAITING_PAYMENT' && <>
        {sale.paymentWay === 'CASH' && (
          <button type="button" className="pwc-shop-primary-button" disabled={busy || readState !== 'success'} onClick={() => sale.act('recordCash')}>Đã nhận đủ tiền mặt</button>
        )}
        {sale.paymentWay === 'VIETQR' && <>
          {sale.vietqrNotice && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{sale.vietqrNotice}</p>}
          {sale.vietqrLink ? <div className="counter-vietqr" role="status">
            <p className="counter-vietqr-title"><strong>Mã VietQR payOS đã sẵn sàng</strong>
              {sale.vietqrLink.expiresAt && <span> · hiệu lực đến {formatCashTime(sale.vietqrLink.expiresAt)}</span>}</p>
            {sale.vietqrLink.orderCode && <p className="pwc-shop-hint">Mã giao dịch payOS: <strong>{sale.vietqrLink.orderCode}</strong></p>}
            <p className="pwc-shop-hint">Mở trang payOS cho khách quét mã. Màn hình tự cập nhật khi payOS xác nhận đã thanh toán.</p>
            <a className="pwc-shop-primary-button counter-vietqr-link" href={sale.vietqrLink.checkoutUrl}>Mở trang VietQR payOS</a>
            <div className="counter-vietqr-tools">
              <button type="button" className="pwc-shop-outline-button" disabled={busy || readState !== 'success'} onClick={sale.checkPayment}>Kiểm tra thanh toán</button>
              <button type="button" className="pwc-shop-outline-button" disabled={busy || readState !== 'success'} onClick={sale.createPaymentLink}>Tạo mã VietQR mới</button>
            </div>
          </div> : (
            <button type="button" className="pwc-shop-primary-button" disabled={busy || readState !== 'success'} onClick={sale.createPaymentLink}>
              {busy ? 'Đang tạo mã…' : sale.vietqrFailed ? 'Tạo mã VietQR mới' : 'Tạo mã VietQR'}
            </button>
          )}
        </>}
        <button type="button" className="pwc-shop-outline-button" disabled={busy || readState !== 'success'} onClick={() => sale.act('cancel')}>Huỷ đơn</button>
      </>}
      {order?.status === 'PAID' && <><button type="button" className="pwc-shop-primary-button" disabled={busy || readState !== 'success'} onClick={() => sale.act('complete')}>Hoàn tất bán</button>
        <p className="pwc-shop-hint">Giao hàng cho khách rồi bấm Hoàn tất bán. Hàng được trừ khỏi tồn kho.</p></>}
      {terminal && <button type="button" className="pwc-shop-primary-button" disabled={busy} onClick={sale.newDraft}>Tạo đơn mới</button>}
    </div>
  </section>;
}
