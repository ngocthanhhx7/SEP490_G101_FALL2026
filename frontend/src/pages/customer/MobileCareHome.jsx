import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import { Button } from '../../components/ui/index.js';
import { MobileServiceChoices } from '../public/MobileServiceChoices.jsx';
import { MobileVisitCard } from './MobileVisitAgenda.jsx';
import { CalendarDays, PawPrint } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { CareHomeBanner } from '../../components/common/CareHomeBanner.jsx';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';

export function MobileCareHome({ api = customerDashboardApi, loadCatalog }) {
  const load = useCallback(({ signal }) => api.read({ signal, group: 'next', limit: 1 }), [api]);
  const result = useApiResource(load);
  const visit = result.data?.items?.[0];
  const { user } = useSession({ optional: true });
  const awaitingPayment = result.data?.metrics?.find(metric => metric.key === 'awaitingPaymentBookings')?.value;
  return <section className="pwc-mobile-screen">
    <p className="pwc-home-greeting">{user?.displayName ? `Chào bạn, ${user.displayName}` : 'Chăm sóc của bạn'}</p>
    {result.status === 'loading' && <p role="status">Đang tìm buổi chăm sóc cần xem…</p>}
    {['pending','error','forbidden'].includes(result.status) &&
      <p role="alert">Chưa cập nhật được lịch chăm sóc. <Button onClick={result.retry}>Thử lại</Button></p>}
    {visit && <section>
      <h2>{visit.state === 'IN_PROGRESS' ? 'Đang chăm sóc' : visit.overdue ? 'Buổi cần theo dõi' : 'Buổi tiếp theo'}</h2>
      <ul className="pwc-mobile-rows"><MobileVisitCard row={visit} actionLabel={visit.state === 'IN_PROGRESS' ? 'Theo dõi buổi chăm sóc' : undefined} /></ul>
    </section>}
    {typeof awaitingPayment === 'number' && awaitingPayment > 0 &&
      <p><Link to="/account/bookings?view=orders">{awaitingPayment} đơn đang chờ thanh toán</Link></p>}
    {['success', 'empty'].includes(result.status) && !visit && <CompactEmpty icon={CalendarDays} title="Chưa có lịch hẹn sắp tới"
      action={<Link className="pwc-compact-cta pwc-compact-cta--quiet" to="/account/bookings">Xem lịch hẹn</Link>}>
      Lịch chăm sóc sẽ xuất hiện ở đây sau khi bạn đặt dịch vụ.
    </CompactEmpty>}
    <CareHomeBanner supporting="Tìm cách chăm sóc phù hợp với bé." />
    <CompactRow icon={PawPrint} to="/account/pets">Hồ sơ thú cưng</CompactRow>
    <MobileServiceChoices loadCatalog={loadCatalog} />
  </section>;
}
