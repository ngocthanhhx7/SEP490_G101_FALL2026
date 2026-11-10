import { bookingMoney, bookingStatus } from '../../utils/booking-presentation.js';
import './booking-details.css';

const zone = { timeZone: 'Asia/Ho_Chi_Minh' };
const dateFormat = new Intl.DateTimeFormat('vi-VN', { ...zone, day: '2-digit', month: '2-digit', year: 'numeric' });
const visitDateFormat = new Intl.DateTimeFormat('vi-VN', { ...zone, day: '2-digit', month: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('vi-VN', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const format = (formatter, value) => value && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : '—';
const date = value => format(dateFormat, value);
const time = value => format(timeFormat, value);
const unique = values => [...new Set(values.filter(Boolean))];
const summary = values => unique(values).join(' · ') || '—';
const amount = value => Number.isSafeInteger(value) ? bookingMoney(value) : '—';
const visitStatus = {
  SCHEDULED: 'Đang tìm người', OFFERED: 'Đang mời', ASSIGNED: 'Đã nhận',
  ARRIVED: 'Đã đến', IN_PROGRESS: 'Đang làm', COMPLETED: 'Đã xong', CANCELLED: 'Đã huỷ'
};
const paymentStatus = { PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán' };

function Row({ label, children }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export function BookingDetailsContent({ booking }) {
  const { terms, visits, price, consentAt } = booking.details;
  const prepay = booking.paymentMode === 'PREPAY';
  const postpay = booking.paymentMode === 'POSTPAY';
  const payment = prepay
    ? booking.state === 'PAYMENT_EXPIRED' ? 'Hết hạn trả trước'
      : ({ PAID: 'Đã thanh toán trước', UNPAID: 'Chờ thanh toán trước' })[booking.paymentState] ?? 'Đang cập nhật trạng thái trả trước'
    : paymentStatus[booking.paymentState] ?? 'Đang cập nhật';
  const serviceNames = summary(terms.map(row => row.serviceName));
  const days = unique(terms.map(row => row.startAt).filter(value => value && Number.isFinite(Date.parse(value))).sort().map(date));
  return <div className="booking-details">
    <header className="booking-details__header">
      <div>
        <h2>{serviceNames === '—' ? 'Lịch chăm sóc thú cưng' : serviceNames}</h2>
        <p>Mã tra cứu: {booking.id}</p>
        {booking.customerName && <p>Khách hàng · <strong>{booking.customerName}</strong></p>}
      </div>
      <span className="booking-details__status">{bookingStatus(booking.state)[0]}</span>
    </header>
    <div className="booking-details__grid">
      <section className="booking-details__card booking-details__terms">
        <h3>Thông tin lịch đặt</h3>
        <dl>
          <Row label="Dịch vụ">{summary(terms.map(row => row.serviceName &&
            [row.serviceName, row.durationMinutes && `${row.durationMinutes} phút`].filter(Boolean).join(', ')))}</Row>
          <Row label="Thú cưng">{summary(terms.flatMap(row => row.petNames))}</Row>
          <Row label="Địa chỉ">{summary(terms.map(row =>
            row.serviceAddress && [row.serviceAddress, row.areaName && `(${row.areaName})`].filter(Boolean).join(' ')))}</Row>
          <Row label="Ngày">{days.length > 1 ? `${days[0]} – ${days.at(-1)}` : days[0] ?? '—'}</Row>
          <Row label="Giờ chăm sóc">{summary(terms.map(row => row.startAt && time(row.startAt)))}</Row>
          <Row label="Người chăm sóc mong muốn">{summary(terms.map(row => row.requestedSitterName))}</Row>
          <Row label="Yêu cầu chăm sóc">{summary(terms.flatMap(row => row.careRequirements))}</Row>
          <Row label="Chính sách trách nhiệm">{consentAt
            ? `Xác nhận đặt lịch lúc ${time(consentAt)} ngày ${date(consentAt)}`
            : '—'}</Row>
        </dl>
      </section>
      <section className="booking-details__card booking-details__payment">
        <h3>Giá và thanh toán</h3>
        <dl>
          <Row label="Số buổi">{price.visitCount ?? '—'}</Row>
          <Row label="Giá một buổi">{summary(price.visitPricesVnd.map(amount))}</Row>
          <Row label="Giảm giá">{price.discountVnd > 0 ? `− ${amount(price.discountVnd)}` : amount(price.discountVnd)}</Row>
          {price.orderFeeVnd > 0 && <Row label="Phí đơn">{amount(price.orderFeeVnd)}</Row>}
          <Row label="Tổng"><strong className="booking-details__total">{amount(price.totalVnd)}</strong></Row>
          <Row label="Thanh toán">{payment}</Row>
          {postpay && <Row label="Hoá đơn">Chưa có dữ liệu</Row>}
        </dl>
        {postpay && <p className="booking-details__note">Bạn trả tiền sau khi chăm sóc xong. Hoá đơn được gửi khi buổi cuối kết thúc, hạn trả là 48 giờ sau khi hoá đơn được chốt.</p>}
      </section>
      <section className="booking-details__card booking-details__visits">
        <h3>Các buổi chăm sóc ({visits.length})</h3>
        {visits.length > 0 ? <div className="booking-details__table" tabIndex={0} role="region" aria-label="Bảng các buổi chăm sóc">
          <table aria-label="Các buổi chăm sóc">
            <thead><tr>{['Ngày', 'Giờ', 'Người chăm sóc', 'Trạng thái', 'Báo cáo'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{visits.map(visit => <tr key={visit.id}>
              <td><time dateTime={visit.startAt ?? undefined} title={date(visit.startAt)}>
                {format(visitDateFormat, visit.startAt)}
              </time></td>
              <td>{time(visit.startAt)} – {time(visit.endAt)}{visit.endAt && date(visit.startAt) !== date(visit.endAt) && ` (${date(visit.endAt)})`}</td>
              <td>{visit.sitterName ?? '—'}</td>
              <td><span className="booking-details__status" data-state={visit.state}>{visitStatus[visit.state] ?? 'Đang cập nhật'}</span></td>
              <td>—</td>
            </tr>)}</tbody>
          </table>
        </div> : <p>Chưa có dữ liệu buổi chăm sóc.</p>}
      </section>
    </div>
  </div>;
}
