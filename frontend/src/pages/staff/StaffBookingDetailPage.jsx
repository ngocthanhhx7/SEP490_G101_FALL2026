import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookingDetailsContent } from '../../components/common/BookingDetailsContent.jsx';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { readStaffBooking } from '../../services/booking-details-api.js';
import { apiErrorFeedback } from '../../utils/api-error-feedback.js';

export function StaffBookingDetailPage() {
  const { bookingId } = useParams();
  return <StaffBookingDetail key={bookingId} bookingId={bookingId} />;
}

function StaffBookingDetail({ bookingId }) {
  const { getCsrfToken } = useSession();
  const request = useMemo(() => createApiClient({ getCsrfToken }), [getCsrfToken]);
  const load = useCallback(({ signal }) => readStaffBooking(request, bookingId, { signal }), [request, bookingId]);
  const resource = useApiResource(load);
  return <section>
    <Link to="/staff/dispatch">Quay lại Điều phối ca</Link>
    <h1>Chi tiết lịch đặt</h1>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải lịch đặt" />}
    {resource.status === 'success' && <BookingDetailsContent booking={resource.data} />}
    {!['loading', 'success'].includes(resource.status) && <Notice state={resource.status} title="Chưa tải được lịch đặt">
      <p>{apiErrorFeedback({ status: resource.httpStatus, code: resource.code })}</p>
      <Button onClick={resource.retry}>Thử lại</Button>
    </Notice>}
  </section>;
}
