import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/index.js';
import { BookingCheckoutForm } from '../public/BookingCheckout.jsx';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { useSession } from '../../contexts/SessionContext.jsx';

export function RecommendationCheckout({ selection, sitter, matchId, service, expiresAt }) {
  const { getCsrfToken } = useSession();
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken }), [getCsrfToken]);
  const [quote, setQuote] = useState(null), [booking, setBooking] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const durationMinutes = (Date.parse(selection.endAt) - Date.parse(selection.startAt)) / 60000;
  const supported = service?.details?.locations?.includes('HOME') && !['ngày', 'km'].includes(service.price.unitLabel) && service.code !== 'vet-escort';
  async function price() {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try {
      if (Date.parse(expiresAt) <= Date.now()) throw new Error('Expired');
      const result = await api.quote([{ serviceId: selection.serviceId, petIds: selection.petIds, durationMinutes, visitCount: 1 }]);
      setQuote(result);
    } catch { setError('Chưa lấy được báo giá cho lịch đã chọn. Kiểm tra thời lượng dịch vụ hoặc tìm lại sitter.'); }
    finally { locked.current = false; setBusy(false); }
  }
  if (!supported) return <p>Lịch này cần nhân viên xác nhận phạm vi dịch vụ.</p>;
  if (booking) return <p>Đã tạo đơn. <Link to={`/services?booking=${encodeURIComponent(booking.id)}`}>Xem đơn chăm sóc</Link></p>;
  return <div><Button disabled={busy || Date.parse(expiresAt) <= Date.now()} onClick={price}>Chọn sitter và xem báo giá</Button>
    {error && <p role="alert">{error}</p>}
    {quote && <><p>Tổng báo giá: {new Intl.NumberFormat('vi-VN').format(quote.totalVnd)} VND</p>
      <BookingCheckoutForm key={quote.quoteId} quote={quote} services={[service]} api={api} onConfirmed={setBooking}
        recommendation={{ ...selection, matchId, requestedSitterId: sitter.sitterId, displayName: sitter.displayName }} /></>}
  </div>;
}
