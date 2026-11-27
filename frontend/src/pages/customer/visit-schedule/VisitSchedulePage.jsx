import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Info, User } from 'lucide-react';
import { Button, Notice } from '../../../components/ui/index.js';
import { useSession } from '../../../contexts/SessionContext.jsx';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { createServiceBasketApi } from '../../../services/service-basket-api.js';
import { apiErrorFeedback } from '../../../utils/api-error-feedback.js';
import {
  VISIT_SCHEDULE_LEGEND,
  bookingDisplayCode,
  formatBookingScheduleSummary,
  groupVisitsByVietnamDay
} from '../../../utils/visit-schedule-format.js';
import './visit-schedule.css';

function visitTrackerPath(bookingId, visitId) {
  return '/account/bookings/' + encodeURIComponent(bookingId) + '/visits/' + encodeURIComponent(visitId);
}

function VisitCardContent({ card }) {
  return <>
    <div className="visit-schedule-card__row visit-schedule-card__time">
      <Clock size={15} aria-hidden="true" />
      <strong>{card.timeRange}</strong>
    </div>
    <div className="visit-schedule-card__row visit-schedule-card__person">
      <User size={15} aria-hidden="true" />
      <span>{card.personLabel}</span>
    </div>
    <span className={`visit-schedule-badge visit-schedule-badge--${card.status.tone}`} data-status={card.status.key}>
      {card.status.label}
    </span>
    {card.movedLabel && <p className="visit-schedule-card__moved">{card.movedLabel}</p>}
  </>;
}

function ScheduleView({ bookingId, api: suppliedApi, now }) {
  const { getCsrfToken } = useSession();
  const api = useMemo(() => suppliedApi ?? createServiceBasketApi({ getCsrfToken }), [suppliedApi, getCsrfToken]);
  const load = useCallback(async ({ signal }) => ({ data: await api.booking(bookingId, { signal }) }), [api, bookingId]);
  const resource = useApiResource(load);
  const backPath = '/account/bookings/' + encodeURIComponent(bookingId);

  if (resource.status === 'loading' || resource.status === 'empty') {
    return <section className="visit-schedule" aria-labelledby="visit-schedule-title">
      <Link className="visit-schedule__back" data-page-back to={backPath}>
        <ArrowLeft size={17} aria-hidden="true" />Quay lại Lịch đặt
      </Link>
      <h1 id="visit-schedule-title">Lịch các buổi</h1>
      <Notice state="loading" title="Đang tải lịch các buổi…">Vui lòng chờ máy chủ phản hồi.</Notice>
    </section>;
  }

  if (resource.status !== 'success' || !resource.data?.details) {
    const error = resource.code || resource.httpStatus
      ? { code: resource.code, status: resource.httpStatus, retryAfterSeconds: resource.retryAfterSeconds }
      : null;
    const retryable = resource.httpStatus !== 404 && resource.httpStatus !== 403;
    return <section className="visit-schedule" aria-labelledby="visit-schedule-title">
      <Link className="visit-schedule__back" data-page-back to={backPath}>
        <ArrowLeft size={17} aria-hidden="true" />Quay lại Lịch đặt
      </Link>
      <h1 id="visit-schedule-title">Lịch các buổi</h1>
      <Notice state={resource.status === 'forbidden' ? 'forbidden' : 'error'}
        title={error ? apiErrorFeedback(error) : 'Chưa tải được lịch các buổi.'}
        action={retryable && <Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />
    </section>;
  }

  const booking = resource.data;
  const bookingRef = bookingDisplayCode(booking, bookingId);
  const bookingCancelled = booking.state === 'CANCELLED';
  const dayColumns = groupVisitsByVietnamDay(booking.details.visits, {
    now: now ?? Date.now(),
    bookingCancelled
  });
  const summaryLine = formatBookingScheduleSummary(booking, dayColumns);

  return <section className="visit-schedule" aria-labelledby="visit-schedule-title">
    <Link className="visit-schedule__back" data-page-back to={backPath}>
      <ArrowLeft size={17} aria-hidden="true" />Quay lại Lịch đặt{bookingRef ? ` ${bookingRef}` : ''}
    </Link>

    <header className="visit-schedule__header">
      <h1 id="visit-schedule-title">Lịch các buổi{bookingRef ? ` · ${bookingRef}` : ''}</h1>
      <p className="visit-schedule__summary">{summaryLine}</p>
    </header>

    <div className="visit-schedule__legend" aria-label="Chú giải trạng thái buổi chăm sóc">
      <span className="visit-schedule__legend-label">Trạng thái:</span>
      {VISIT_SCHEDULE_LEGEND.map(item => (
        <span key={item.key} className={`visit-schedule-badge visit-schedule-badge--${item.tone}`}>
          {item.label}
        </span>
      ))}
    </div>

    {dayColumns.length > 0 ? <div className="visit-schedule__board" role="region" aria-label="Lịch các buổi theo ngày" tabIndex={0}>
      {dayColumns.map(day => (
        <section key={day.dateKey}
          className={`visit-schedule-day${day.isToday ? ' visit-schedule-day--today' : ''}`}
          aria-label={`${day.weekday}${day.isToday ? ' · hôm nay' : ''} ${day.shortDate}`}>
          <header className="visit-schedule-day__header">
            <p className="visit-schedule-day__weekday">
              {day.weekday}{day.isToday && <span className="visit-schedule-day__today"> · hôm nay</span>}
            </p>
            <h2 className="visit-schedule-day__date">{day.shortDate}</h2>
          </header>
          <div className="visit-schedule-day__cards">
            {day.visits.map(card => card.clickable ? (
              <Link key={card.id} className="visit-schedule-card visit-schedule-card--link"
                to={visitTrackerPath(bookingId, card.id)}
                aria-label={`Buổi ${card.timeRange}, ${day.shortDate}, ${card.personLabel}, ${card.status.label}`}>
                <VisitCardContent card={card} />
              </Link>
            ) : (
              <article key={card.id} className="visit-schedule-card visit-schedule-card--cancelled" aria-disabled="true">
                <VisitCardContent card={card} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </div> : <Notice state="empty" title="Chưa có buổi chăm sóc nào trong lịch đặt này." />}

    <p className="visit-schedule__note">
      <Info size={16} aria-hidden="true" />
      <span>Mỗi buổi có khung giờ và trạng thái riêng. Bấm vào một buổi để xem chi tiết, hướng dẫn chăm sóc hoặc báo cáo của buổi đó.</span>
    </p>
  </section>;
}

export function VisitSchedulePage({ api, now } = {}) {
  const { bookingId } = useParams();
  return <ScheduleView key={bookingId} bookingId={bookingId} api={api} now={now} />;
}
