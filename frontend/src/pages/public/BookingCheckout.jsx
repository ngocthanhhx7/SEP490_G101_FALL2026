import { useCallback, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, CreditCard, RefreshCw } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { googleMapsDirections } from '../../utils/maps.js';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const locations = { HOME: 'Tại nhà', FACILITY: 'Tại cơ sở', OUTDOOR: 'Ngoài trời' };
const statuses = { AWAITING_PAYMENT: 'Chờ thanh toán', PAYMENT_EXPIRED: 'Đã hết hạn thanh toán', DISPATCH_PENDING: 'Chờ phân công', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn tất' };
const errorText = code => ({ QUOTE_CHANGED: 'Giá, điều kiện hoặc hồ sơ đã thay đổi. Vui lòng lấy báo giá mới.',
  RESOURCE_NOT_FOUND: 'Báo giá, địa chỉ hoặc đơn không còn khả dụng.', QUOTE_ALREADY_USED: 'Báo giá này đã được dùng để đặt dịch vụ.',
  VISIT_SCHEDULE_OVERLAP: 'Lịch của cùng thú cưng đang bị trùng giờ.', BOARDING_CARE_PLAN_REQUIRED: 'Lịch lưu trú cần được nhân viên xác nhận kế hoạch ca chăm sóc.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'Chưa thể tạo link thanh toán. Đơn vẫn đang chờ thanh toán.',
  PAYMENT_LINK_RECONCILIATION_REQUIRED: 'Yêu cầu thanh toán đang cần đối soát. Vui lòng liên hệ Paw World Care.',
  COMMAND_PENDING: 'Yêu cầu đang được xử lý.', INVALID_STATE: 'Đơn không còn ở trạng thái có thể thanh toán.',
  VALIDATION_FAILED: 'Kiểm tra ngày giờ và địa điểm của từng buổi; buổi trả trước phải bắt đầu sau hạn thanh toán 15 phút.' })[code] || 'Chưa xác nhận được thao tác. Vui lòng thử lại.';

export function BookingCheckoutForm({ quote, services, api, onConfirmed }) {
  const addresses = useApiResource(api.addresses), options = useApiResource(api.checkoutOptions), [busy, setBusy] = useState(false), [error, setError] = useState(null), [uncertain, setUncertain] = useState(false);
  const command = useRef(null), locked = useRef(false);
  const visits = quote.items.flatMap((item, itemIndex) => Array.from({ length: item.visitCount }, (_, index) => ({ itemIndex, index,
    service: services.find(service => service.id === item.serviceId) })));
  const [selectedLocations, setSelectedLocations] = useState(() => visits.map(row => row.service?.details?.locations?.[0] || 'HOME'));
  const submit = async event => {
    event.preventDefault(); if (locked.current) return;
    if (!uncertain) {
      const data = new window.FormData(event.currentTarget);
      const body = { quoteId: quote.quoteId, acceptServicePolicies: data.get('consent') === 'on', visits: visits.map((row, index) => ({
        itemIndex: row.itemIndex, startAt: `${data.get(`start:${index}`)}:00+07:00`, location: selectedLocations[index],
        ...(data.get(`sitter:${index}`) ? { requestedSitterId: data.get(`sitter:${index}`) } : {}),
        ...(selectedLocations[index] !== 'FACILITY' ? { addressId: data.get(`address:${index}`) } : {}) })) };
      const fingerprint = JSON.stringify(body);
      if (command.current?.fingerprint !== fingerprint) command.current = { body, fingerprint, key: `checkout:${globalThis.crypto.randomUUID()}` };
    }
    locked.current = true; setBusy(true); setError(null);
    try { const response = await api.confirm(command.current.body, command.current.key); onConfirmed(response); }
    catch (failure) { setError(errorText(failure.code)); setUncertain(['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR'].includes(failure.code)); }
    finally { locked.current = false; setBusy(false); }
  };
  return <form className="pwc-booking-checkout" onSubmit={submit}><h3>Lịch chăm sóc</h3>
    <fieldset disabled={busy || uncertain}>
      {visits.map((row, index) => <div className="pwc-checkout-visit" key={index}>
        <h4>{row.service?.name} · Buổi {row.index + 1}</h4>
        <label>Bắt đầu (giờ Việt Nam)<input type="datetime-local" name={`start:${index}`} required /></label>
        <label>Địa điểm<select value={selectedLocations[index]} onChange={event => setSelectedLocations(current => current.map((value, i) => i === index ? event.target.value : value))}>
          {(row.service?.details?.locations || ['HOME']).map(value => <option key={value} value={value}>{locations[value]}</option>)}
        </select></label>
        <label>Nhân viên chăm sóc<select name={`sitter:${index}`} defaultValue="">
          <option value="">Paw World Care sắp xếp</option>
          {(options.data?.sitters || []).map(sitter => <option key={sitter.id} value={sitter.id}>{sitter.displayName}</option>)}
        </select></label>
        {selectedLocations[index] === 'FACILITY' && <p>{options.data?.facilityAddress || 'Chưa có địa chỉ cơ sở được xác nhận.'}</p>}
        {selectedLocations[index] !== 'FACILITY' && <label>Địa chỉ đã lưu<select name={`address:${index}`} required defaultValue="">
          <option value="">Chọn địa chỉ</option>{(addresses.data || []).map(address => <option key={address.id || address._id} value={address.id || address._id}>{address.label}</option>)}
        </select></label>}
      </div>)}
      {addresses.status === 'error' && <p role="alert">Chưa tải được địa chỉ. <button type="button" onClick={addresses.retry}>Tải lại địa chỉ</button></p>}
      {selectedLocations.some(value => value !== 'FACILITY') && addresses.status === 'empty' && <p><Link to="/account/sitter-recommendations">Thêm địa chỉ chăm sóc</Link></p>}
      {quote.items.map((item, index) => item.servicePolicy && <details key={index}><summary>{item.servicePolicy.title}</summary><p className="pwc-checkout-policy">{item.servicePolicy.body}</p></details>)}
      <label className="pwc-checkout-consent"><input type="checkbox" name="consent" required />Tôi xác nhận lịch, báo giá và điều kiện dịch vụ trên đơn.</label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {options.status === 'error' && <p role="alert">Đặt lịch hiện chưa khả dụng. <button type="button" onClick={options.retry}>Thử lại</button></p>}
    <button type="submit" disabled={busy || options.status !== 'success'}><CalendarCheck size={18} />{busy ? 'Đang xác nhận…' : uncertain ? 'Xác nhận lại' : 'Xác nhận đặt dịch vụ'}</button>
  </form>;
}

export function BookingConfirmation({ api }) {
  const [params] = useSearchParams(), bookingId = params.get('booking');
  const load = useCallback(({ signal }) => api.booking(bookingId, { signal }).then(data => ({ data })), [api, bookingId]);
  return bookingId ? <BookingConfirmationDetail key={bookingId} bookingId={bookingId} api={api} load={load} /> : null;
}
function BookingConfirmationDetail({ bookingId, api, load }) {
  const resource = useApiResource(load), [link, setLink] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const key = useRef(`payment-link:${globalThis.crypto.randomUUID()}`), locked = useRef(false);
  const pay = async () => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(null);
    try {
      const result = await api.paymentLink(bookingId, key.current), url = new URL(result.checkoutUrl);
      if (url.origin !== 'https://pay.payos.vn' || !url.pathname.startsWith('/web/')) throw new Error('Invalid payment URL');
      setLink(url.href);
    } catch (failure) { setError(errorText(failure.code)); } finally { locked.current = false; setBusy(false); }
  };
  if (resource.status === 'loading') return <p role="status">Đang tải đơn…</p>;
  if (resource.status !== 'success') return <div role="alert"><p>Chưa tải được đơn.</p><button type="button" onClick={resource.retry}>Tải lại đơn</button></div>;
  const booking = resource.data, awaiting = booking.state === 'AWAITING_PAYMENT' && new Date(booking.paymentDeadlineAt) > new Date();
  return <section className="pwc-booking-confirmation"><h3>Đơn {booking.id}</h3><p>{statuses[booking.state] || booking.state}</p>
    <p>Tổng tiền: <strong>{money(booking.totalVnd)}</strong></p>
    {booking.paymentDeadlineAt && <p>Hạn thanh toán: {new Date(booking.paymentDeadlineAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    <ul>{booking.visits.map(row => <li key={row.id}><strong>{row.serviceName}</strong> · {new Date(row.startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}<br />{locations[row.location]}: {row.serviceAddress}
      {googleMapsDirections(row.serviceAddress) && <p><a href={googleMapsDirections(row.serviceAddress)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Chỉ đường bằng Google Maps</a></p>}
      </li>)}</ul>
    {(booking.careShifts || []).map(row => <div key={row.id}><VisitTravel api={api} visitId={row.id} startAt={row.startAt} endAt={row.endAt} /></div>)}
    {(booking.scheduleProposals || []).filter(row => row.state === 'PENDING_CUSTOMER_CONFIRMATION' && new Date(row.expiresAt) > new Date()).map(row =>
      <p key={row.id}><Link to={`/account/schedule-proposals/${row.id}`}>Xem đề xuất lịch chăm sóc</Link></p>)}
    {awaiting && (link ? <a href={link} rel="noopener noreferrer">Thanh toán qua payOS</a> : <button type="button" disabled={busy} onClick={pay}><CreditCard size={18} />{busy ? 'Đang tạo link…' : 'Tạo link thanh toán'}</button>)}
    <button type="button" title="Cập nhật trạng thái đơn" aria-label="Cập nhật trạng thái đơn" onClick={() => { setLink(null); resource.retry(); }}><RefreshCw size={18} /></button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
