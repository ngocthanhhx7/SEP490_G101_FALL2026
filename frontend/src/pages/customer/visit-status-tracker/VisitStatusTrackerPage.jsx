import { useCallback, useId, useMemo } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { BookingVisitReport } from '../../../components/common/BookingVisitReport.jsx';
import { Button, Notice } from '../../../components/ui/index.js';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { useVisitTracker } from '../../../hooks/useVisitTracker.js';
import { createVisitTrackerApi } from '../../../services/visit-tracker-api.js';
import { createServiceBasketApi } from '../../../services/service-basket-api.js';
import { createPrivateImageApi } from '../../../services/private-image-api.js';
import { apiErrorFeedback } from '../../../utils/api-error-feedback.js';
import './visit-status-tracker.css';

const vietnam = { timeZone: 'Asia/Ho_Chi_Minh' };
const time = new Intl.DateTimeFormat('vi-VN', { ...vietnam, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const day = new Intl.DateTimeFormat('en-GB', { ...vietnam, day: '2-digit', month: '2-digit' });
const fullDay = new Intl.DateTimeFormat('en-GB', { ...vietnam, day: '2-digit', month: '2-digit', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('vi-VN', { ...vietnam, weekday: 'long' });
const ratingFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const labels = {
  ASSIGNED: 'Đã nhận', ARRIVED: 'Đã đến', IN_PROGRESS: 'Đang làm', FINISHED: 'Đã xong', REPORT_READY: 'Có báo cáo',
  FINDING_SITTER: 'Đang tìm người', CANCELLED: 'Đã huỷ', CLOSED: 'Đã đóng',
  AWAITING_PAYMENT: 'Chờ thanh toán trước', PAYMENT_EXPIRED: 'Hết hạn thanh toán',
  CARE_PLAN_PENDING: 'Chờ kế hoạch chăm sóc', OVERDUE: 'Quá hạn', PENDING: 'Đang cập nhật'
};

function clockRange(start, end) {
  if (!start || !end) return 'Chưa ghi nhận';
  const differentDays = fullDay.format(new Date(start)) !== fullDay.format(new Date(end));
  return time.format(new Date(start)) + ' – ' + (differentDays ? day.format(new Date(end)) + ', ' : '') + time.format(new Date(end));
}

function eventTime(value, startAt) {
  if (!value) return '—';
  const date = new Date(value);
  const onVisitDay = startAt && fullDay.format(date) === fullDay.format(new Date(startAt));
  return (onVisitDay ? '' : day.format(date) + ', ') + time.format(date);
}

function updateLabel(key, sitter) {
  const name = sitter?.name ?? 'Người chăm sóc';
  return {
    ASSIGNED: name + ' nhận buổi chăm sóc.',
    ARRIVED: name + ' đã đến và check-in.',
    IN_PROGRESS: 'Người chăm sóc bắt đầu làm việc theo checklist.',
    FINISHED: 'Người chăm sóc đã check-out.',
    REPORT_READY: 'Người chăm sóc đã check-out. Báo cáo chăm sóc đã sẵn sàng.'
  }[key];
}

function Panel({ title, children }) {
  const id = useId();
  return <section className="visit-tracker-panel" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    {children}
  </section>;
}

function Progress({ visit, milestones }) {
  return <Panel title="Tiến trình buổi">
    {visit.showProgress ? <ol className="visit-tracker-steps">{milestones.map((step, index) => {
      const current = step.key === visit.status;
      return <li key={step.key} aria-current={current ? 'step' : undefined} data-reached={step.reached}>
        <span className="visit-tracker-step-mark" aria-hidden="true">{step.reached && !current ? <Check size={20} /> : index + 1}</span>
        <strong>{labels[step.key]}</strong>
        <time dateTime={step.at ?? undefined}>{current && step.key === 'IN_PROGRESS' && step.at ? 'từ ' : ''}
          {eventTime(step.at, visit.startAt)}</time>
      </li>;
    })}</ol> : <p>{labels[visit.status] ?? labels.PENDING}</p>}
    {visit.showProgress && <p className="visit-tracker-note">Trang tự cập nhật khi người chăm sóc check-in, lưu checklist hoặc check-out. Báo cáo chăm sóc có ngay sau khi check-out.</p>}
  </Panel>;
}

function ReportAction({ bookingId, visitId }) {
  const api = useMemo(() => createServiceBasketApi(), []);
  const images = useMemo(() => createPrivateImageApi(), []);
  const load = useCallback(async ({ signal }) => {
    const booking = await api.booking(bookingId, { signal });
    return { data: booking.details?.visits?.find(visit => visit.id === visitId) ?? null };
  }, [api, bookingId, visitId]);
  const report = useApiResource(load);
  if (report.status === 'loading') return <p role="status">Đang tải báo cáo chăm sóc…</p>;
  if (report.status !== 'success') return <p>Chưa mở được báo cáo. <Button variant="ghost" onClick={report.retry}>Thử lại</Button></p>;
  return <BookingVisitReport visit={report.data} readEvidence={images.read} />;
}

function Tracker({ bookingId, visitId }) {
  const read = useMemo(() => createVisitTrackerApi(), []);
  const load = useCallback(signal => read(bookingId, visitId, { signal }), [read, bookingId, visitId]);
  const { data, error, retry } = useVisitTracker(load);
  const back = '/account/bookings/' + encodeURIComponent(bookingId);
  if (!data) return <div className="visit-tracker">
    <Link className="visit-tracker-back" to={back}><ArrowLeft size={18} />Quay lại Lịch đặt</Link>
    {error ? <Notice state="error" title={apiErrorFeedback(error)}
      action={error.status !== 404 && <Button variant="secondary" onClick={retry}>Thử lại</Button>} />
      : <Notice state="loading" title="Đang tải buổi chăm sóc…" />}
  </div>;

  const { visit, booking, sitter, milestones, updates, actions } = data;
  const status = labels[visit.status] ?? labels.PENDING;
  const range = clockRange(visit.startAt, visit.endAt);
  const petNames = visit.pets.map(pet => pet.name).join(', ');
  const petDetails = visit.pets.map(pet => pet.breed ? pet.name + ' (' + pet.breed + ')' : pet.name).join(', ');
  const start = visit.startAt && new Date(visit.startAt);
  const date = start ? weekday.format(start) + ', ' + fullDay.format(start) : null;
  const caption = [visit.serviceName, date, range, petNames].filter(Boolean).join(' · ');
  const cancelled = visit.status === 'CANCELLED';
  return <div className="visit-tracker">
    <Link className="visit-tracker-back" to={back}><ArrowLeft size={18} />Quay lại Lịch đặt{booking.code && ' ' + booking.code}</Link>
    <header className="visit-tracker-heading">
      <div><h1>Theo dõi buổi chăm sóc</h1><span className="visit-tracker-status" data-status={visit.status}>{status}</span></div>
      <p>{caption}</p>
    </header>
    {error && <p role="status">Chưa cập nhật được trạng thái. Trang sẽ tự thử lại.</p>}
    <div className="visit-tracker-grid">
      <div className="visit-tracker-stack">
        {!cancelled && <Progress visit={visit} milestones={milestones} />}
        {updates.length > 0 && <Panel title="Cập nhật trong buổi">
          <ul className="visit-tracker-updates">{updates.map(({ key, at }) => <li key={key}>
            <time dateTime={at}>{eventTime(at, visit.startAt)}</time><span>{updateLabel(key, sitter)}</span>
          </li>)}</ul>
        </Panel>}
        <Panel title="Thông tin buổi">
          <dl className="visit-tracker-facts">
            <div><dt>Dịch vụ</dt><dd>{[visit.serviceName, visit.durationMinutes && visit.durationMinutes + ' phút'].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt>Thú cưng</dt><dd>{petDetails || '—'}</dd></div>
            <div><dt>Địa chỉ</dt><dd>{visit.address || '—'}</dd></div>
            <div><dt>Giờ chăm sóc</dt><dd>{range}</dd></div>
            <div><dt>Lịch đặt</dt><dd>{booking.code ?? booking.id} · buổi {booking.visitNumber} trên {booking.visitCount}</dd></div>
          </dl>
        </Panel>
      </div>
      <aside className="visit-tracker-stack" aria-label="Người chăm sóc và thao tác">
        {sitter && <Panel title="Người chăm sóc">
          <div className="visit-tracker-person">
            <span aria-hidden="true">{sitter.name.trim().split(/\s+/u).filter((_, index, words) => index === 0 || index === words.length - 1).map(word => word[0]).join('').toUpperCase()}</span>
            <div><strong>{sitter.name}</strong>
              <p>{Number.isFinite(sitter.rating) ? '★ ' + ratingFormat.format(sitter.rating) + ' trên 5' : 'Chưa có đánh giá'}</p></div>
          </div>
        </Panel>}
        {actions.careReport && <Panel title="Thao tác"><ReportAction bookingId={booking.id} visitId={visit.id} /></Panel>}
      </aside>
    </div>
  </div>;
}

export function VisitStatusTrackerPage() {
  const { bookingId, visitId } = useParams();
  return <Tracker key={bookingId + ':' + visitId} bookingId={bookingId} visitId={visitId} />;
}
