import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createComplaintApi } from '../../services/complaint-api.js';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { bookingDate } from '../../utils/booking-presentation.js';
import { complaintSubmitPath, visitLabel } from '../../utils/complaint-presentation.js';
import { BookingConfirmation } from '../public/BookingCheckout.jsx';
import './customer-bookings.css';

function BookingComplaintVisits({ api, bookingId }) {
  const resource = useApiResource(useCallback(({ signal }) => api.eligibility({ bookingId, signal }), [api, bookingId]));
  if (resource.status === 'loading') return <p role="status">Đang tải các buổi chăm sóc…</p>;
  if (resource.status !== 'success') return <Notice state="error" title="Chưa tải được các buổi chăm sóc"
    action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />;
  const { visits, wholeBooking } = resource.data;
  return <section className="booking-complaint-visits" aria-labelledby="booking-complaint-visits-title">
    <h3 id="booking-complaint-visits-title">Các buổi chăm sóc</h3>
    {wholeBooking.eligible && wholeBooking.aboveVisitTable && <p>
      <Link className="pwc-button pwc-button--secondary" to={complaintSubmitPath(bookingId)}>Gửi khiếu nại</Link>
    </p>}
    {visits.length ? <ul className="booking-complaint-visits__rows">
      {visits.map(visit => <li key={visit.id}>
        <div><strong>{visit.serviceName ?? 'Buổi chăm sóc'}</strong>
          <p>{bookingDate(visit.startAt)}</p>
          {visit.sitterName && <p>{visit.sitterName}</p>}
        </div>
        <span className="booking-complaint-visits__status">{visitLabel(visit.state)}</span>
        {visit.state !== 'CANCELLED' && visit.canSubmit && <Link className="pwc-button pwc-button--secondary"
          to={complaintSubmitPath(bookingId, visit.id)}>Gửi khiếu nại</Link>}
      </li>)}
    </ul> : <p>Chưa có buổi chăm sóc.</p>}
  </section>;
}

export function CustomerBookingDetailPage() {
  const { bookingId } = useParams(), { getCsrfToken } = useSession();
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken }), [getCsrfToken]);
  const complaints = useMemo(() => createComplaintApi({ getCsrfToken }), [getCsrfToken]);
  return <section className="customer-booking-detail"><Link className="customer-booking-detail__back" to="/account/bookings"><ArrowLeft size={17} />Danh sách đơn chăm sóc</Link>
    <h1>Chi tiết đơn chăm sóc</h1><p>Lịch đã đặt, người chăm sóc, thanh toán và tiến độ từng buổi.</p>
    <BookingConfirmation key={bookingId} bookingId={bookingId} api={api}
      visitActions={<BookingComplaintVisits api={complaints} bookingId={bookingId} />} />
  </section>;
}
