import { useCallback, useRef, useState } from 'react';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import './customer-unpaid-bookings.css';

const paymentStates = new Set(['PENDING', 'RECONCILING', 'PROCESSING']);
const finishedStates = new Set(['PAID', 'FAILED', 'EXPIRED']);
const supportedStates = new Set(['UNPAID', 'PENDING', 'RECONCILING', 'PROCESSING', ...finishedStates]);
const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
});
const redirectToPayOS = url => window.location.assign(url);

function isUtcTimestamp(value) {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function validBooking(row) {
  return row && typeof row.id === 'string' && row.id.length > 0
    && typeof row.reference === 'string' && row.reference.length > 0
    && Number.isSafeInteger(row.amountVnd) && row.amountVnd > 0
    && Number.isSafeInteger(row.originalVisitCount) && row.originalVisitCount >= 1
    && Number.isSafeInteger(row.quoteVersion) && row.quoteVersion >= 0
    && supportedStates.has(row.paymentState)
    && (row.expiresAt === undefined || isUtcTimestamp(row.expiresAt));
}

function isExpired(row, now) {
  if (row.paymentState === 'EXPIRED') return true;
  if (typeof row.expiresAt !== 'string') return false;
  const expiresAt = Date.parse(row.expiresAt);
  return Number.isFinite(expiresAt) && Number.isFinite(now) && expiresAt <= now;
}

function checkoutUrlFrom(result) {
  const value = result?.data?.checkoutUrl || result?.data?.paymentLink?.url;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'pay.payos.vn' ? url.href : null;
  } catch {
    return null;
  }
}

function messageForCommandError(error) {
  if (error?.status === 403 || error?.code === 'FORBIDDEN') {
    return 'Bạn không có quyền thanh toán booking này.';
  }
  if (error?.code === 'DECISION_REQUIRED') {
    return 'Thanh toán đang chờ xác nhận điều kiện của booking. Chưa tạo liên kết mới.';
  }
  if (error?.code === 'PROVIDER_UNAVAILABLE') {
    return 'Cổng thanh toán hiện chưa sẵn sàng. Trạng thái booking chưa thay đổi.';
  }
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return 'Chưa nhận được xác nhận từ máy chủ. Hãy tải lại trạng thái trước khi thử lại.';
  }
  return 'Chưa thể tạo liên kết thanh toán. Trạng thái chỉ được cập nhật từ máy chủ.';
}

function newOperationKey() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') return null;
  return globalThis.crypto.randomUUID();
}

function BookingCard({ booking, now, busy, blocked, notice, onPay }) {
  const expired = isExpired(booking, now);
  const pending = paymentStates.has(booking.paymentState);
  const terminal = finishedStates.has(booking.paymentState);
  const payEnabled = typeof onPay === 'function' && booking.paymentState === 'UNPAID'
    && booking.originalVisitCount > 1 && Number.isFinite(now)
    && !expired && !pending && !terminal && !blocked;

  return <li className="unpaid-booking-card">
    <div className="unpaid-booking-card__top">
      <div>
        <p className="unpaid-booking-card__eyebrow">Mã booking</p>
        <h2>{booking.reference}</h2>
      </div>
      <span className={`unpaid-booking-status${pending ? ' unpaid-booking-status--pending' : ''}`}>
        {expired ? 'Liên kết đã hết hạn' : pending ? 'Đang chờ xác nhận'
          : booking.paymentState === 'PAID' ? 'Đã thanh toán'
            : booking.paymentState === 'FAILED' ? 'Thanh toán thất bại' : 'Chưa thanh toán'}
      </span>
    </div>
    <dl className="unpaid-booking-card__details">
      <div><dt>Số buổi ban đầu</dt><dd>{booking.originalVisitCount}</dd></div>
      <div><dt>Số tiền cần thanh toán</dt><dd>{currency.format(booking.amountVnd)}</dd></div>
    </dl>
    {booking.originalVisitCount > 1 && <p className="unpaid-booking-card__prepay">
      Booking nhiều buổi cần thanh toán đủ trước khi được gửi yêu cầu tìm người chăm sóc.
    </p>}
    {pending && <p className="unpaid-booking-card__hint">
      Chỉ webhook đã được máy chủ xác minh mới xác nhận thanh toán. Không đóng trang thanh toán để thay đổi trạng thái booking.
    </p>}
    {booking.originalVisitCount === 1 && booking.paymentState === 'UNPAID' && <Notice state="pending"
      title="Bill postpay chờ API thanh toán">
      Booking một visit thanh toán sau khi hoàn tất; API tạo bill và payment command đang chờ P01/P34.
    </Notice>}
    {booking.paymentState === 'UNPAID' && !Number.isFinite(now) && <Notice state="error"
      title="Chưa xác minh được thời gian máy chủ">
      API phải trả về meta.serverNow theo UTC. Tải lại trước khi tạo lệnh thanh toán.
    </Notice>}
    {expired && <p className="unpaid-booking-card__hint">
      Tải lại danh sách để máy chủ kiểm tra trạng thái và cung cấp bước tiếp theo.
    </p>}
    {!onPay && booking.originalVisitCount > 1 && <Notice state="pending" title="Thanh toán chưa được kết nối">
      Lệnh tạo payment intent đang chờ P01/P34 tích hợp.
    </Notice>}
    {notice && <Notice state={notice.state} title={notice.title}>{notice.message}</Notice>}
    {booking.originalVisitCount > 1 && <div className="unpaid-booking-card__actions">
      <Button type="button" onClick={() => onPay?.(booking)} disabled={!payEnabled || busy}
        loading={busy} loadingLabel="Đang tạo liên kết…">
        Thanh toán qua payOS
      </Button>
    </div>}
  </li>;
}

export function CustomerUnpaidBookingsPage({ api, openCheckout = redirectToPayOS }) {
  const [busyBookingId, setBusyBookingId] = useState(null);
  const [uncertainBookingIds, setUncertainBookingIds] = useState(() => new Set());
  const [commandNotices, setCommandNotices] = useState({});
  const operationKeys = useRef(new Map());
  const load = useCallback(({ signal }) => {
    if (typeof api?.listUnpaidBookings !== 'function') {
      return Promise.resolve({ data: null, pending: true });
    }
    return api.listUnpaidBookings({ signal });
  }, [api]);
  const resource = useApiResource(load);
  const trustedServerNow = resource.status === 'pending' ? null : isUtcTimestamp(resource.meta?.serverNow)
    ? Date.parse(resource.meta.serverNow) : null;

  async function startPayment(booking) {
    if (typeof api?.createPaymentIntent !== 'function' || busyBookingId || booking.originalVisitCount <= 1
      || !Number.isFinite(trustedServerNow) || isExpired(booking, trustedServerNow)
      || paymentStates.has(booking.paymentState) || finishedStates.has(booking.paymentState)) return;

    const operationScope = `${booking.id}:${booking.quoteVersion}`;
    let operationKey = operationKeys.current.get(operationScope);
    if (!operationKey) {
      operationKey = newOperationKey();
      if (!operationKey) {
        setCommandNotices(previous => ({ ...previous, [booking.id]: {
          state: 'error', title: 'Thiết bị chưa sẵn sàng', message: 'Hãy tải lại trang trong trình duyệt được hỗ trợ.'
        } }));
        return;
      }
      operationKeys.current.set(operationScope, operationKey);
    }

    setBusyBookingId(booking.id);
    setCommandNotices(previous => ({ ...previous, [booking.id]: null }));
    try {
      const result = await api.createPaymentIntent({
        bookingId: booking.id,
        quoteVersion: booking.quoteVersion,
        idempotencyKey: operationKey,
      });
      if (result?.pending) {
        setUncertainBookingIds(previous => new Set(previous).add(booking.id));
        setCommandNotices(previous => ({ ...previous, [booking.id]: {
          state: 'pending', title: 'Đang chờ máy chủ xử lý',
          message: 'Chưa có xác nhận thanh toán. Tải lại trạng thái trước khi gửi lệnh khác.'
        } }));
        resource.retry();
        return;
      }
      const checkoutUrl = checkoutUrlFrom(result);
      if (!checkoutUrl) {
        setCommandNotices(previous => ({ ...previous, [booking.id]: {
          state: 'error', title: 'Liên kết không hợp lệ', message: 'Máy chủ chưa trả về liên kết payOS an toàn.'
        } }));
        return;
      }
      openCheckout(checkoutUrl);
    } catch (error) {
      setCommandNotices(previous => ({ ...previous, [booking.id]: {
        state: error?.status === 403 || error?.code === 'FORBIDDEN' ? 'forbidden' : 'error',
        title: error?.status === 403 || error?.code === 'FORBIDDEN' ? 'Không thể thanh toán booking này' : 'Chưa tạo được liên kết',
        message: messageForCommandError(error),
      } }));
      if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') resource.retry();
      if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
        setUncertainBookingIds(previous => new Set(previous).add(booking.id));
      }
    } finally {
      setBusyBookingId(null);
    }
  }

  function refresh() {
    setUncertainBookingIds(new Set());
    resource.retry();
  }

  if (resource.status === 'pending' && (resource.data === null || resource.data === undefined)) {
    return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title">
      <header className="customer-unpaid-bookings__header">
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
      </header>
      <Notice state="pending" title="Đang chờ kết nối thanh toán">
        Danh sách booking sẽ xuất hiện khi API và phân quyền P01/P34 được tích hợp.
      </Notice>
    </main>;
  }

  if (resource.status === 'loading') {
    return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title" aria-busy="true">
      <header className="customer-unpaid-bookings__header">
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
      </header>
      <Notice state="loading" title="Đang tải booking">Trạng thái đang được đọc từ máy chủ.</Notice>
    </main>;
  }

  if (resource.status === 'forbidden') {
    return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title">
      <header className="customer-unpaid-bookings__header">
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
      </header>
      <Notice state="forbidden" title="Không thể xem booking">
        Máy chủ từ chối yêu cầu. Booking vẫn được bảo vệ theo tài khoản đăng nhập.
      </Notice>
      <Button variant="secondary" onClick={refresh}>Thử tải lại</Button>
    </main>;
  }

  if (resource.status === 'error') {
    return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title">
      <header className="customer-unpaid-bookings__header">
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
      </header>
      <Notice state="error" title="Chưa tải được booking">
        Không có trạng thái thanh toán nào được suy ra. Hãy thử tải lại.
      </Notice>
      <Button variant="secondary" onClick={refresh}>Thử tải lại</Button>
    </main>;
  }

  const rows = Array.isArray(resource.data) ? resource.data : resource.data?.bookings;
  if (resource.status === 'empty' || (resource.status === 'success' && Array.isArray(rows) && rows.length === 0)) {
    return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title">
      <header className="customer-unpaid-bookings__header">
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
      </header>
      <Notice state="empty" title="Bạn không có booking cần thanh toán">
        Các booking đã trả hoặc chưa đến bước thanh toán không xuất hiện ở đây.
      </Notice>
      <Button variant="secondary" onClick={refresh}>Tải lại</Button>
    </main>;
  }

  if (!Array.isArray(rows) || rows.some(row => !validBooking(row))) {
    return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title">
      <header className="customer-unpaid-bookings__header">
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
      </header>
      <Notice state="error" title="Dữ liệu booking chưa hợp lệ">
        Máy chủ chưa trả về bản ghi phù hợp với hợp đồng thanh toán. Không thể mở thanh toán.
      </Notice>
      <Button variant="secondary" onClick={refresh}>Thử tải lại</Button>
    </main>;
  }

  return <main className="customer-unpaid-bookings" aria-labelledby="unpaid-bookings-title">
    <header className="customer-unpaid-bookings__header">
      <div>
        <p className="customer-unpaid-bookings__eyebrow">Tài khoản của bạn</p>
        <h1 id="unpaid-bookings-title">Booking chưa thanh toán</h1>
        <p>Liên kết thanh toán được tạo trên máy chủ. Trạng thái được xác nhận qua webhook đã kiểm tra.</p>
      </div>
      <Button variant="secondary" onClick={refresh}>Tải lại trạng thái</Button>
    </header>
    {resource.status === 'pending' && <Notice state="pending" title="Đang đối soát">
      Yêu cầu thanh toán đang được máy chủ kiểm tra. Không gửi lại liên kết mới.
    </Notice>}
    <ul className="unpaid-booking-list">
      {rows.map(booking => <BookingCard key={booking.id} booking={booking} now={trustedServerNow}
        busy={busyBookingId === booking.id} blocked={uncertainBookingIds.has(booking.id)}
        notice={commandNotices[booking.id]}
        onPay={typeof api?.createPaymentIntent === 'function' ? startPayment : null} />)}
    </ul>
  </main>;
}
