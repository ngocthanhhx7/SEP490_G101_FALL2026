import { createPrivateImageApi } from '../../services/private-image-api.js';
import { BookingVisitReport } from '../../components/common/BookingVisitReport.jsx';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createComplaintApi } from '../../services/complaint-api.js';
import { createBookingChangeApi } from '../../services/booking-change-api.js';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { complaintDeadline, complaintSubmitPath, complaintVisitStart, visitLabel } from '../../utils/complaint-presentation.js';
import { BookingConfirmation } from '../public/BookingCheckout.jsx';
import { BookingDetailsContent } from '../../components/common/BookingDetailsContent.jsx';
import { BookingChangeDialog } from './BookingChangeDialog.jsx';
import { bookingChangeSent, bookingChangeVisitLabel } from '../../utils/booking-change-format.js';
import './customer-bookings.css';

function ComplaintListAction({ resource, bookingId }) {
  if (resource.status === 'loading' || resource.status === 'empty') return <p role="status">Đang tải điều kiện khiếu nại…</p>;
  if (resource.status !== 'success') return <Notice state="error" title="Chưa tải được các buổi chăm sóc"
    action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />;
  const { wholeBooking } = resource.data;
  return wholeBooking.eligible && wholeBooking.aboveVisitTable ? <p>
    <Link className="pwc-button pwc-button--secondary" to={complaintSubmitPath(bookingId)}>Gửi khiếu nại</Link>
  </p> : null;
}

function ComplaintVisitActions({ visits, bookingId }) {
  return visits.map(visit => <div key={visit.id} className="booking-complaint-visit">
    {visits.length > 1 && <span>{complaintVisitStart(visit.startAt)}</span>}
    <span className="booking-complaint-visit__status">{visitLabel(visit.state)}</span>
    {visit.state !== 'CANCELLED' && visit.canSubmit && <Link className="pwc-button pwc-button--secondary"
      to={complaintSubmitPath(bookingId, visit.id)}>Gửi khiếu nại</Link>}
  </div>);
}

function CustomerBookingDetail({ bookingId }) {
  const { getCsrfToken } = useSession();
  const [booking, setBooking] = useState(null);
  const api = useMemo(() => {
    const checkout = createServiceBasketApi({ getCsrfToken });
    return {
      ...checkout,
      async booking(id, { signal } = {}) {
        if (!signal?.aborted) setBooking(null);
        const result = await checkout.booking(id, { signal });
        if (!signal?.aborted) setBooking(result);
        return result;
      }
    };
  }, [getCsrfToken]);
  const images = useMemo(() => createPrivateImageApi({ getCsrfToken }), [getCsrfToken]);
  const complaints = useMemo(() => createComplaintApi({ getCsrfToken }), [getCsrfToken]);
  const eligibility = useApiResource(useCallback(({ signal }) => booking
    ? complaints.eligibility({ bookingId, signal }) : Promise.resolve({ data: null }), [booking, bookingId, complaints]));
  const visitsByRow = useMemo(() => {
    const rows = new Map();
    for (const visit of eligibility.data?.visits ?? []) {
      for (const rowId of new Set([visit.customerVisitId, visit.id].filter(Boolean))) {
        const visits = rows.get(rowId) ?? [];
        visits.push(visit);
        rows.set(rowId, visits);
      }
    }
    return rows;
  }, [eligibility.data]);
  const changeApi = useMemo(() => createBookingChangeApi({ getCsrfToken }), [getCsrfToken]);
  const changeOptions = useApiResource(useCallback(({ signal }) => booking?.details
    ? changeApi.options(bookingId, { signal }) : Promise.resolve({ data: null }), [booking, bookingId, changeApi]));
  const [changeDialog, setChangeDialog] = useState(null);
  const [changeSent, setChangeSent] = useState(false);
  const options = changeOptions.status === 'success' ? changeOptions.data : null;
  const changeable = options?.visits.filter(visit => visit.canSelect) ?? [];
  function openBookingChange(visitId) {
    setChangeSent(false);
    setChangeDialog({ booking, options, initialVisitId: visitId });
  }

  const visitActions = {
    reportForVisit: visit => <BookingVisitReport visit={visit} readEvidence={images.read} />,
    booking: options?.canChangeBooking && changeable.length > 0 && <section className="booking-change-actions">
      <h3>Thao tác</h3>
      <Button aria-label="Đổi giờ cho cả lịch đặt" onClick={() => openBookingChange()}>Đổi giờ</Button>
    </section>,
    beforeList: <>
      {changeSent && <p className="booking-change-sent" role="status">{bookingChangeSent}</p>}
      <ComplaintListAction resource={eligibility} bookingId={bookingId} />
    </>,
    columnLabel: changeable.length > 0 ? 'Thao tác' : undefined,
    forVisit: row => {
      const visit = changeable.find(item => item.id === row.id || item.customerVisitId === row.id);
      return <>
        <ComplaintVisitActions visits={visitsByRow.get(row.id) ?? []} bookingId={bookingId} />
        {visit && <Button variant="ghost" className="booking-change-visit-action"
          aria-label={'Đổi giờ buổi ' + bookingChangeVisitLabel(visit)}
          onClick={() => openBookingChange(visit.id)}>Đổi giờ</Button>}
      </>;
    }
  };
  const overdue = booking?.state === 'OVERDUE';
  const deadline = overdue ? complaintDeadline(booking.paymentDeadlineAt) : null;
  return <section className="customer-booking-detail"><Link className="customer-booking-detail__back" to="/account/bookings"><ArrowLeft size={17} />Danh sách đơn chăm sóc</Link>
    <h1>Chi tiết đơn chăm sóc</h1><p>Lịch đã đặt, người chăm sóc, thanh toán và tiến độ từng buổi.</p>
    {overdue && <div className="customer-booking-detail__payment">
      <strong className="customer-bookings__status customer-bookings__status--payment_expired">Quá hạn</strong>
      {deadline && <p>Hạn thanh toán: {deadline}</p>}
    </div>}
    <div className={overdue ? 'customer-booking-detail__confirmation--overdue' : undefined}>
      <BookingConfirmation bookingId={bookingId} api={api} Details={BookingDetailsContent} visitActions={visitActions} />
    </div>
    {changeDialog && <BookingChangeDialog {...changeDialog} api={changeApi}
      onClose={() => setChangeDialog(null)} onSent={() => {
        setChangeDialog(null);
        setChangeSent(true);
        changeOptions.retry();
      }} />}
  </section>;
}

export function CustomerBookingDetailPage() {
  const { bookingId } = useParams();
  return <CustomerBookingDetail key={bookingId} bookingId={bookingId} />;
}
