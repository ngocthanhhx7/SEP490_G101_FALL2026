import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { BookingConfirmation } from '../public/BookingCheckout.jsx';
import { BookingDetailsContent } from '../../components/common/BookingDetailsContent.jsx';
import './customer-bookings.css';

export function CustomerBookingDetailPage() {
  const { bookingId } = useParams(), { getCsrfToken } = useSession();
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken }), [getCsrfToken]);
  return <section className="customer-booking-detail"><Link className="customer-booking-detail__back" to="/account/bookings"><ArrowLeft size={17} />Danh sách đơn chăm sóc</Link>
    <h1>Chi tiết đơn chăm sóc</h1><p>Lịch đã đặt, người chăm sóc, thanh toán và tiến độ từng buổi.</p>
    <BookingConfirmation key={bookingId} bookingId={bookingId} api={api} Details={BookingDetailsContent} />
  </section>;
}
