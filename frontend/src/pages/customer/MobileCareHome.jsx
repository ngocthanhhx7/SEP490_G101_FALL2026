import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useUpcomingGrooming } from '../../hooks/useUpcomingGrooming.js';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import { createGroomingBookingApi } from '../../services/grooming-booking-api.js';
import { Button } from '../../components/ui/index.js';
import { MobileServiceChoices } from '../public/MobileServiceChoices.jsx';
import { MobileVisitCard } from './MobileVisitAgenda.jsx';
import { GroomingUpcomingRow } from '../../components/grooming/GroomingUpcomingRow.jsx';
import { GroomingCancelDialog } from '../../components/grooming/GroomingCancelDialog.jsx';
import { CalendarDays, PawPrint } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { CareHomeBanner } from '../../components/common/CareHomeBanner.jsx';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';

export function MobileCareHome({ api = customerDashboardApi, loadCatalog, groomingApi = null, createGroomingApi = createGroomingBookingApi }) {
  const load = useCallback(({ signal }) => api.read({ signal, group: 'next', limit: 1 }), [api]);
  const result = useApiResource(load);
  const visit = result.data?.items?.[0];
  const session = useSession({ optional: true });
  const { user } = session;
  const grooming = useUpcomingGrooming({
    enabled: Boolean(groomingApi) || session.status === 'authenticated',
    getCsrfToken: session.getCsrfToken,
    api: groomingApi,
    createApi: createGroomingApi
  });
  const awaitingPayment = result.data?.metrics?.find(metric => metric.key === 'awaitingPaymentBookings')?.value;
  const urgentVisit = visit && (visit.state === 'IN_PROGRESS' || visit.overdue) ? visit : null;
  const upcomingVisit = visit && !urgentVisit ? visit : null;
  const comingUp = useMemo(() => {
    const entries = [];
    if (upcomingVisit) entries.push({ kind: 'visit', key: `visit:${upcomingVisit.id}`, sortKey: Date.parse(upcomingVisit.startsAt) || 0, row: upcomingVisit });
    for (const appointment of grooming.items) {
      entries.push({ kind: 'grooming', key: `grooming:${appointment.id}`, sortKey: Date.parse(appointment.slot.startAt) || 0, appointment });
    }
    return entries.sort((a, b) => a.sortKey - b.sortKey);
  }, [grooming.items, upcomingVisit]);
  const hasAny = Boolean(urgentVisit) || comingUp.length > 0;
  return <section className="pwc-mobile-screen">
    <p className="pwc-home-greeting">{user?.displayName ? `Chào bạn, ${user.displayName}` : 'Chăm sóc của bạn'}</p>
    {grooming.toastMessage && <p className="grooming-upcoming__toast" role="status">{grooming.toastMessage}</p>}
    {result.status === 'loading' && <p role="status">Đang tìm buổi chăm sóc cần xem…</p>}
    {['pending','error','forbidden'].includes(result.status) &&
      <p role="alert">Chưa cập nhật được lịch chăm sóc. <Button onClick={() => { result.retry(); grooming.reload(); }}>Thử lại</Button></p>}
    {urgentVisit && <section>
      <h2>{urgentVisit.state === 'IN_PROGRESS' ? 'Đang chăm sóc' : 'Buổi cần theo dõi'}</h2>
      <ul className="pwc-mobile-rows"><MobileVisitCard row={urgentVisit} actionLabel={urgentVisit.state === 'IN_PROGRESS' ? 'Theo dõi buổi chăm sóc' : undefined} /></ul>
    </section>}
    {comingUp.length > 0 && <section>
      <h2>Sắp tới</h2>
      <ul className="pwc-mobile-rows">{comingUp.map(entry => (entry.kind === 'visit'
        ? <MobileVisitCard key={entry.key} row={entry.row} />
        : <GroomingUpcomingRow
          key={entry.key}
          variant="mobile"
          appointment={entry.appointment}
          busy={grooming.cancellingId === entry.appointment.id}
          inlineError={grooming.inlineErrors[entry.appointment.id] ?? ''}
          onCancel={grooming.requestCancel}
        />))}</ul>
    </section>}
    {typeof awaitingPayment === 'number' && awaitingPayment > 0 &&
      <p><Link to="/account/bookings?view=orders">{awaitingPayment} đơn đang chờ thanh toán</Link></p>}
    {['success', 'empty'].includes(result.status) && !hasAny && <CompactEmpty icon={CalendarDays} title="Chưa có lịch hẹn sắp tới"
      action={<Link className="pwc-compact-cta pwc-compact-cta--quiet" to="/account/bookings">Xem lịch hẹn</Link>}>
      Lịch chăm sóc sẽ xuất hiện ở đây sau khi bạn đặt dịch vụ.
    </CompactEmpty>}
    <CareHomeBanner supporting="Tìm cách chăm sóc phù hợp với bé." />
    <CompactRow icon={PawPrint} to="/account/pets">Hồ sơ thú cưng</CompactRow>
    <MobileServiceChoices loadCatalog={loadCatalog} />
    <GroomingCancelDialog
      appointment={grooming.pendingCancel}
      busy={Boolean(grooming.cancellingId)}
      onConfirm={grooming.confirmCancel}
      onClose={grooming.closeCancelDialog}
    />
  </section>;
}
