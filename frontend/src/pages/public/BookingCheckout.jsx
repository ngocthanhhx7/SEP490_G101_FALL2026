import { PolicyContextLinks } from './policies/PolicyLinks.jsx';
import { useCallback, useRef, useState } from 'react';
import { bookingStatus, bookingDate } from '../../utils/booking-presentation.js';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, CreditCard, RefreshCw } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { googleMapsDirections } from '../../utils/maps.js';
import { apiErrorFeedback } from '../../utils/api-error-feedback.js';
import { BookingDateTime } from '../../components/calendar/BookingDateTime.jsx';
import { vietnamDate, vietnamDateTime } from '../../utils/calendar-date.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';
import { VerifiedVisitRating } from '../customer/VerifiedVisitRating.jsx';
import { Button, Dialog } from '../../components/ui/index.js';
import { PickupSelectionField, pickupReady, pickupInput, pickupPrice, PICKUP_UNAVAILABLE } from '../../components/common/PickupSelectionField.jsx';
import './booking-checkout.css';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const locations = { HOME: 'Tại nhà', FACILITY: 'Tại cửa hàng', OUTDOOR: 'Ngoài trời' };
const errorText = error => ({ QUOTE_CHANGED: 'Giá, điều kiện hoặc hồ sơ đã thay đổi. Vui lòng lấy báo giá mới.',
  MATCH_EXPIRED: 'Gợi ý đã hết hạn. Vui lòng tìm lại sitter.', MATCH_CHANGED: 'Hồ sơ hoặc lịch khác với gợi ý. Vui lòng tìm lại sitter.',
  MATCH_ALREADY_USED: 'Gợi ý này đã tạo đơn. Kiểm tra đơn của bạn trước khi tìm lại.',
  RESOURCE_NOT_FOUND: 'Báo giá, địa chỉ hoặc đơn không còn khả dụng.', QUOTE_ALREADY_USED: 'Báo giá này đã được dùng để đặt dịch vụ.',
  VISIT_SCHEDULE_OVERLAP: 'Lịch của cùng thú cưng đang bị trùng giờ.', BOARDING_CARE_PLAN_REQUIRED: 'Lịch lưu trú cần được nhân viên xác nhận kế hoạch ca chăm sóc.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'Không thể mở trang thanh toán ngay lúc này. Vui lòng thử lại sau ít phút. (MSG33)',
  PAYOS_TIMEOUT: 'Không thể mở trang thanh toán ngay lúc này. Vui lòng thử lại sau ít phút. (MSG33)',
  PAYOS_REQUEST_FAILED: 'Không thể mở trang thanh toán ngay lúc này. Vui lòng thử lại sau ít phút. (MSG33)',
  PAYOS_REQUEST_REJECTED: 'Không thể mở trang thanh toán ngay lúc này. Vui lòng thử lại sau ít phút. (MSG33)',
  PROVIDER_UNAVAILABLE: 'Không thể mở trang thanh toán ngay lúc này. Vui lòng thử lại sau ít phút. (MSG33)',
  PAYMENT_LINK_RECONCILIATION_REQUIRED: 'Yêu cầu thanh toán đang cần đối soát. Vui lòng liên hệ Paw World Care.',
  PREFERRED_SITTER_HISTORY_REQUIRED: 'Bạn chỉ có thể chọn người chăm sóc đã từng chăm thú cưng này trước đó.',
  SITTER_AVAILABILITY_CONSENT_REQUIRED: 'Lịch của người chăm sóc đã thay đổi. Vui lòng kiểm tra lại từng buổi.',
  MSG20: 'Một lịch đặt kéo dài tối đa 30 ngày.',
  ADDRESS_OUT_OF_SERVICE_AREA: 'Rất tiếc, chúng tôi chưa phục vụ địa chỉ này.',
  GROOMING_PAYMENT_OUTSTANDING: 'Bạn còn tiền dịch vụ spa chưa thanh toán. Vui lòng thanh toán tại cửa hàng trước khi đặt lịch mới.',
  HOME_BOOKING_NOTICE_REQUIRED: 'Đặt lịch chăm sóc tại nhà trước ít nhất 2 giờ.',
  PICKUP_DISTANCE_UNAVAILABLE: PICKUP_UNAVAILABLE,
  PICKUP_QUOTE_CHANGED: 'Phí đón vừa thay đổi. Vui lòng xem lại trước khi xác nhận.',
  PICKUP_DISTANCE_EXCEEDED: 'Địa chỉ đón vượt quá khoảng cách cho phép. Vui lòng chọn lại địa chỉ.',
  COMMAND_PENDING: 'Yêu cầu đang được xử lý.', INVALID_STATE: 'Đơn không còn ở trạng thái có thể thanh toán.',
  VALIDATION_FAILED: 'Kiểm tra ngày giờ và địa điểm của từng buổi; buổi trả trước phải bắt đầu sau hạn thanh toán 15 phút.' })[error.code] || apiErrorFeedback(error, 'Chưa xác nhận được thao tác. Vui lòng thử lại.');

const busyReasons = new Set(['DAY_OFF', 'OUTSIDE_WORKING_HOURS', 'SLOT_UNAVAILABLE']);

function PreviousSitterField({ api, quoteId, itemIndex, index, start, location, addressId }) {
  const load = useCallback(async ({ signal }) => {
    const visit = { itemIndex, startAt: start + ':00+07:00', location, ...(location !== 'FACILITY' && { addressId }) };
    return { data: (await api.availability({ quoteId, visit }, { signal })).sitters };
  }, [api, quoteId, itemIndex, start, location, addressId]);
  const result = useApiResource(load);
  if (result.status === 'error') return <p role="alert">Chưa tải được người chăm sóc mong muốn. <button type="button" onClick={result.retry}>Thử lại</button></p>;
  if (!result.data?.length) return null;
  return <label>Người chăm sóc mong muốn<select name={`sitter:${index}`} defaultValue="">
    <option value="">Paw World Care sắp xếp</option>
    {result.data.map(s => <option key={s.id} value={s.id} data-busy={s.eligible === false && busyReasons.has(s.unavailableReason)}
      disabled={s.eligible === false && !busyReasons.has(s.unavailableReason)}>{s.displayName}</option>)}
  </select></label>;
}

export function BookingCheckoutForm({ quote, services, api, onConfirmed, recommendation, onEditQuote }) {
  const addresses = useApiResource(api.addresses), options = useApiResource(api.checkoutOptions), [busy, setBusy] = useState(false), [error, setError] = useState(null), [uncertain, setUncertain] = useState(false);
  const command = useRef(null), locked = useRef(false);
  const visits = quote.items.flatMap((item, itemIndex) => Array.from({ length: item.visitCount }, (_, index) => ({ itemIndex, index,
    service: services.find(service => service.id === item.serviceId) })));
  const [selectedLocations, setSelectedLocations] = useState(() => visits.map(row => recommendation ? 'HOME' : row.service?.details?.locations?.[0] || 'HOME'));
  const [starts, setStarts] = useState(() => visits.map(() => recommendation ? vietnamDateTime(new Date(recommendation.startAt)) : ''));
  const [addressIds, setAddressIds] = useState(() => visits.map(() => recommendation?.addressId ?? ''));
  const [pickups, setPickups] = useState(() => visits.map(() => null));
  const pickupFee = pickups.reduce((sum, value, index) => sum + (selectedLocations[index] === 'FACILITY' ? pickupPrice(value) : 0), 0);
  const allPickupsReady = pickups.every((value, index) => selectedLocations[index] !== 'FACILITY' || pickupReady(value));
  const [busySlots, setBusySlots] = useState([]);
  const today = vietnamDate();
  const minimumFor = location => vietnamDateTime(new Date(Math.ceil((Date.now() + (location === 'HOME'
    ? 2 * 3600000 : quote.paymentMode === 'PREPAY' ? 15 * 60000 : 1)) / 60000) * 60000));
  const submit = async event => {
    event.preventDefault(); if (locked.current || (!uncertain && !allPickupsReady)) return;
    if (!uncertain) {
      const selected = starts.map((value, index) => {
        const item = quote.items[visits[index].itemIndex];
        const started = new Date(`${value}:00+07:00`);
        const minutes = item.dayCount ? item.dayCount * 1440 : item.durationMinutes ?? 60;
        return { start: started.getTime(), end: started.getTime() + minutes * 60000 };
      });
      const valid = selected.every(row => Number.isFinite(row.start) && Number.isFinite(row.end));
      if (valid) {
        const first = new Date(Math.min(...selected.map(row => row.start)));
        const last = new Date(Math.max(...selected.map(row => row.end)) - 1);
        const vietnamDay = date => {
          const local = new Date(date.getTime() + 7 * 3600000);
          return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) / 86400000;
        };
        if (vietnamDay(last) - vietnamDay(first) > 30) {
          setError('Một lịch đặt kéo dài tối đa 30 ngày.');
          return;
        }
      }
      const data = new window.FormData(event.currentTarget);
      const body = { quoteId: quote.quoteId, acceptServicePolicies: data.get('consent') === 'on', visits: visits.map((row, index) => ({
        itemIndex: row.itemIndex, startAt: `${data.get(`start:${index}`)}:00+07:00`, location: selectedLocations[index],
        ...(data.get(`sitter:${index}`) ? { requestedSitterId: data.get(`sitter:${index}`) } : {}),
        ...(selectedLocations[index] !== 'FACILITY' ? { addressId: data.get(`address:${index}`) } : {}),
        ...(selectedLocations[index] === 'FACILITY' && pickupInput(pickups[index]) ? { pickup: pickupInput(pickups[index]) } : {}),
        ...(recommendation ? { matchId: recommendation.matchId, requestedSitterId: recommendation.requestedSitterId,
          addressId: recommendation.addressId, startAt: recommendation.startAt, location: 'HOME' } : {}) })) };
      const fingerprint = JSON.stringify(body);
      if (command.current?.fingerprint !== fingerprint) command.current = { body, fingerprint, key: `checkout:${globalThis.crypto.randomUUID()}` };
      const conflicts = visits.flatMap((_, index) => event.currentTarget.elements.namedItem(`sitter:${index}`)?.selectedOptions?.[0]?.dataset.busy === 'true'
        && !command.current.body.visits[index].acceptUnavailableSitter ? [index] : []);
      if (conflicts.length) { setError(null); setBusySlots(conflicts); return; }
    }
    return confirmCommand();
  };
  const confirmCommand = async (accepted = []) => {
    if (locked.current) return;
    if (accepted.length) {
      const current = command.current;
      const body = { ...current.body, visits: current.body.visits.map((row, index) =>
        accepted.includes(index) ? { ...row, acceptUnavailableSitter: true } : row) };
      command.current = { ...current, body, key: `checkout:${globalThis.crypto.randomUUID()}` };
      setBusySlots([]);
    }
    locked.current = true; setBusy(true); setError(null);
    try { const response = await api.confirm(command.current.body, command.current.key); onConfirmed(response); }
    catch (failure) {
      if (failure.status === 409 && failure.code === 'SITTER_AVAILABILITY_CONSENT_REQUIRED') {
        const conflicts = command.current.body.visits.flatMap((row, index) => row.requestedSitterId && !row.acceptUnavailableSitter
          && failure.lineFields?.[index]?.acceptUnavailableSitter ? [index] : []);
        setUncertain(false);
        if (conflicts.length) { setBusySlots(conflicts); return; }
      }
      setError(errorText(failure));
      setUncertain(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'COMMAND_PENDING', 'INVALID_RESPONSE', 'ABORTED'].includes(failure.code) || failure.status >= 500);
    }
    finally { locked.current = false; setBusy(false); }
  };
  return <form className="pwc-booking-checkout" onSubmit={submit}><h3>Lịch chăm sóc</h3>
    {options.data?.groomingPaymentOutstanding && <p role="alert">Bạn còn tiền dịch vụ spa chưa thanh toán. Vui lòng thanh toán tại cửa hàng trước khi đặt lịch mới.</p>}
    <fieldset disabled={busy || uncertain}>
      {visits.map((row, index) => <div className="pwc-checkout-visit" key={index}>
        <h4>{row.service?.name} · Buổi {row.index + 1}</h4>
        <BookingDateTime compact label="Bắt đầu (giờ Việt Nam)" name={`start:${index}`}
          durationMinutes={quote.items[row.itemIndex].dayCount ? undefined : quote.items[row.itemIndex].durationMinutes}
          value={starts[index]} readOnly={Boolean(recommendation)} today={today} minimum={minimumFor(selectedLocations[index])}
          onChange={start => setStarts(current => current.map((value, i) => i === index ? start : value))} />
        <label>Địa điểm<select disabled={Boolean(recommendation)} value={selectedLocations[index]} onChange={event => setSelectedLocations(current => current.map((value, i) => i === index ? event.target.value : value))}>
          {(row.service?.details?.locations || ['HOME']).map(value => <option key={value} value={value}>{locations[value]}</option>)}
        </select></label>
        {recommendation ? <label>Người chăm sóc mong muốn<select disabled value={recommendation.requestedSitterId}>
          <option value={recommendation.requestedSitterId}>{recommendation.displayName}</option></select></label>
          : api.availability && starts[index] && (selectedLocations[index] === 'FACILITY' || addressIds[index]) &&
            <PreviousSitterField key={[starts[index],selectedLocations[index],addressIds[index]].join('|')} api={api} quoteId={quote.quoteId}
              itemIndex={row.itemIndex} index={index} start={starts[index]} location={selectedLocations[index]} addressId={addressIds[index]} />}
        {selectedLocations[index] === 'FACILITY' && <p>{options.data?.facilityAddress || 'Chưa có địa chỉ cơ sở được xác nhận.'}</p>}
        {selectedLocations[index] === 'FACILITY' && api.pickupQuote && <PickupSelectionField addresses={addresses.data ?? []}
          api={api} value={pickups[index]} onChange={value => setPickups(current => current.map((old, i) => i === index ? value : old))} />}
        {selectedLocations[index] !== 'FACILITY' && <label>Địa chỉ đã lưu<select name={`address:${index}`} required disabled={Boolean(recommendation)}
          value={addressIds[index]} onChange={event => setAddressIds(current => current.map((value, i) => i === index ? event.target.value : value))}>
          <option value="">Chọn địa chỉ</option>{(addresses.data || []).map(address => <option key={address.id || address._id} disabled={address.served === false} value={address.id || address._id}>{address.label}{address.served === false ? " — Chưa phục vụ" : ""}</option>)}
        </select></label>}
      </div>)}
      {addresses.status === 'error' && <p role="alert">Chưa tải được địa chỉ. <button type="button" onClick={addresses.retry}>Tải lại địa chỉ</button></p>}
      {selectedLocations.some(value => value !== 'FACILITY') && addresses.status === 'empty' && <p><Link to="/account/addresses">Thêm địa chỉ chăm sóc</Link></p>}
      {quote.items.map((item, index) => item.servicePolicy && <details key={index}><summary>{item.servicePolicy.title}</summary><p className="pwc-checkout-policy">{item.servicePolicy.body}</p></details>)}
      <section aria-label="Tóm tắt và giá" className="pwc-basket-total">
        <h4>Tóm tắt và giá</h4>
        <dl>
          {quote.items.map((item, index) => <div key={index}>
            <dt>{services.find(service => service.id === item.serviceId)?.name ?? `Dịch vụ ${index + 1}`} · {item.visitCount} buổi · Giá một buổi</dt>
            <dd>{item.subtotalVnd % item.visitCount === 0 ? money(item.subtotalVnd / item.visitCount)
              : `${money(Math.floor(item.subtotalVnd / item.visitCount))} – ${money(Math.ceil(item.subtotalVnd / item.visitCount))}`}</dd>
          </div>)}
          <div><dt>Tạm tính</dt><dd>{money(quote.baseVnd + quote.surchargeVnd)}</dd></div>
          <div><dt>Giảm nhiều buổi</dt><dd>− {money(quote.discountVnd)}</dd></div>
          <div><dt>Giảm giá hạng {({ MEMBER: 'Member', SILVER: 'Silver', GOLD: 'Gold' })[quote.tier?.code] ?? ''}</dt>
            <dd>− {money(quote.tierDiscountVnd ?? 0)}</dd></div>
          {pickups.some((value, index) => value && selectedLocations[index] === 'FACILITY') && <div><dt>Phí đón (cả hai chiều)</dt><dd>{money(pickupFee)}</dd></div>}
          <div><dt>Tổng thanh toán</dt><dd><strong>{money(quote.totalVnd + pickupFee)}</strong></dd></div>
        </dl>
      </section>
      <label className="pwc-checkout-consent"><input type="checkbox" name="consent" required />Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.</label>
    </fieldset>
    <PolicyContextLinks context="booking" />
    {error && <p role="alert">{error}</p>}
    {options.status === 'error' && <p role="alert">Đặt lịch hiện chưa khả dụng. <button type="button" onClick={options.retry}>Thử lại</button></p>}
    {onEditQuote && <button type="button" disabled={busy || uncertain} onClick={onEditQuote}>Quay lại báo giá</button>}
    <button type="submit" disabled={busy || (!uncertain && !allPickupsReady) || options.status !== 'success' || options.data?.groomingPaymentOutstanding}><CalendarCheck size={18} />{busy ? 'Đang xác nhận…' : uncertain ? 'Xác nhận lại' : 'Xác nhận đặt dịch vụ'}</button>
    <Dialog open={busySlots.length > 0} onClose={() => setBusySlots([])} title="Người chăm sóc mong muốn không rảnh"
      description={busySlots.map(index => `Buổi ${index + 1} (${starts[index].replace('T', ' ')})`).join(', ')}
      footer={<><Button type="button" onClick={() => { command.current = null; setBusySlots([]); }}>Đổi ngày</Button>
        <Button type="button" onClick={() => void confirmCommand(busySlots)}>Vẫn đặt lịch</Button></>} />
  </form>;

}

export function BookingConfirmation({ api, bookingId: suppliedBookingId, Details, visitActions }) {
  const [params] = useSearchParams(), bookingId = suppliedBookingId ?? params.get('booking');
  const load = useCallback(({ signal }) => api.booking(bookingId, { signal }).then(data => ({ data })), [api, bookingId]);
  return bookingId ? <BookingConfirmationDetail key={bookingId} bookingId={bookingId} api={api} load={load} Details={Details} visitActions={visitActions} /> : null;
}
function BookingConfirmationDetail({ bookingId, api, load, Details, visitActions }) {
  const [params] = useSearchParams();
  const resource = useApiResource(load), [link, setLink] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const key = useRef(`payment-link:${globalThis.crypto.randomUUID()}`), locked = useRef(false);
  const pay = async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(null);
    try {
      const result = await api.paymentLink(bookingId, key.current), url = new URL(result.checkoutUrl);
      if (url.origin !== 'https://pay.payos.vn' || !url.pathname.startsWith('/web/')) throw new Error('Invalid payment URL');
      setLink(url.href);
    } catch (failure) { setError(errorText(failure)); } finally { locked.current = false; setBusy(false); }
  };
  if (resource.status === 'loading') return <p role="status">Đang tải đơn…</p>;
  if (resource.status !== 'success') return <div role="alert"><p>{Details
    ? apiErrorFeedback({ status: resource.httpStatus, code: resource.code }, 'Chưa tải được đơn.')
    : 'Chưa tải được đơn.'}</p><button type="button" onClick={resource.retry}>Tải lại đơn</button></div>;
  const booking = resource.data, awaiting = booking.state === 'AWAITING_PAYMENT' && new Date(booking.paymentDeadlineAt) > new Date();
  const cancelledAtProvider = params.get('payment') === 'cancelled' && booking.paymentState !== 'PAID';
  const ratingDeadline = booking.completedAt ? new Date(new Date(booking.completedAt).getTime() + 7 * 86400000) : null;
  const canRate = booking.state === 'COMPLETED' && ratingDeadline && new Date() <= ratingDeadline;
  const completedSitterIds = new Set();
  const rateableShifts = (booking.careShifts || []).filter(row => {
    if (!row.sitterId || row.state !== 'COMPLETED' || completedSitterIds.has(row.sitterId)) return false;
    completedSitterIds.add(row.sitterId);
    return true;
  });
  const showDetails = Details && booking.details;
  const paymentDeadline = booking.paymentDeadlineAt && ['AWAITING_PAYMENT', 'PAYMENT_EXPIRED'].includes(booking.state)
    ? new Date(booking.paymentDeadlineAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : null;
  return <section className="pwc-booking-confirmation">
    {showDetails ? <>
      <Details booking={booking} visitActions={visitActions} />
      {booking.createdAt && <p>Ngày đặt: {bookingDate(booking.createdAt)}</p>}
      {paymentDeadline && booking.paymentMode === 'PREPAY' && <p>Hạn trả trước: {paymentDeadline}</p>}
    </> : <><h2>{[...new Set(booking.visits.map(row => row.serviceName).filter(Boolean))].join(', ') || 'Lịch chăm sóc thú cưng'}</h2><p className="pwc-booking-reference">Mã tra cứu: {booking.id}</p><p className="pwc-booking-current-status">{bookingStatus(booking.state)[0]}</p><p>{bookingStatus(booking.state)[1]}</p>{booking.createdAt && <p>Ngày đặt: {bookingDate(booking.createdAt)}</p>}
    <p>Tổng tiền: <strong>{money(booking.totalVnd)}</strong></p>
    {booking.paymentState && <p>Thanh toán: <strong>{({ PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán' })[booking.paymentState] ?? 'Đang cập nhật xác nhận'}</strong></p>}
    {paymentDeadline && <p>Hạn thanh toán: {paymentDeadline}</p>}
    <h3>Lịch chăm sóc đã đặt</h3>{visitActions?.beforeList}<ul>{booking.visits.map((row, index) => <li key={row.id}><p>Buổi {index + 1}{row.petNames?.length ? ` · ${row.petNames.join(', ')}` : ''}</p><strong>{row.serviceName}</strong> · {new Date(row.startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}<br />{locations[row.location]}: {row.serviceAddress}
      {googleMapsDirections(row.serviceAddress) && <p><a href={googleMapsDirections(row.serviceAddress)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a></p>}
      {visitActions?.forVisit?.(row)}</li>)}</ul></>}
    {showDetails && [...new Set(booking.visits.map(row => row.serviceAddress).filter(Boolean))].map(address =>
      googleMapsDirections(address) && <p key={address}><a href={googleMapsDirections(address)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a></p>)}
    {(booking.careShifts || []).map(row => <div key={row.id}><h4>{row.serviceName}</h4>{row.sitterName && <p>Người chăm sóc: <strong>{row.sitterName}</strong></p>}<p>{({ ASSIGNED: 'Người chăm sóc đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn tất ca' })[row.state] ?? row.state}</p>
      {row.checkInAt && <p>Bắt đầu: {new Date(row.checkInAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
      {row.checkOutAt && <p>Hoàn tất: {new Date(row.checkOutAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
      {row.state === 'ASSIGNED' && <VisitTravel api={api} visitId={row.id} startAt={row.startAt} endAt={row.endAt} />}</div>)}
    {canRate && rateableShifts.filter(row => !booking.ratedSitterIds?.includes(row.sitterId))
      .map(row => <VerifiedVisitRating key={row.sitterId} api={api} visit={row} deadline={ratingDeadline} />)}
    {(booking.scheduleProposals || []).filter(row => row.state === 'PENDING_CUSTOMER_CONFIRMATION' && new Date(row.expiresAt) > new Date()).map(row =>
      <p key={row.id}><Link to={`/account/schedule-proposals/${row.id}`}>Xem đề xuất lịch chăm sóc</Link></p>)}
    {awaiting && (link ? <a href={link} rel="noopener noreferrer">Thanh toán qua payOS</a> : <button type="button" disabled={busy} onClick={pay}><CreditCard size={18} />{busy ? 'Đang tạo link…' : 'Tạo link thanh toán'}</button>)}
    {cancelledAtProvider && <p role="alert">Thanh toán không thành công hoặc đã bị hủy. Vui lòng thử lại. (MSG32)</p>}
    <button type="button" title="Cập nhật trạng thái đơn" aria-label="Cập nhật trạng thái đơn" onClick={() => { setLink(null); resource.retry(); }}><RefreshCw size={18} /></button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
