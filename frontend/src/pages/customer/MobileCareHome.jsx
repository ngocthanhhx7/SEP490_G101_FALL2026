import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import { Button } from '../../components/ui/index.js';
import { MobileServiceChoices } from '../public/MobileServiceChoices.jsx';
import { MobileVisitCard } from './MobileVisitAgenda.jsx';

export function MobileCareHome({ api = customerDashboardApi, loadCatalog }) {
  const load = useCallback(({ signal }) => api.read({ signal, group: 'next', limit: 1 }), [api]);
  const result = useApiResource(load);
  const visit = result.data?.items?.[0];
  const awaitingPayment = result.data?.metrics?.find(metric => metric.key === 'awaitingPaymentBookings')?.value;
  return <section className="pwc-mobile-screen">
    <h1>Chăm sóc của bạn</h1>
    {result.status === 'loading' && <p role="status">Đang tìm buổi chăm sóc cần xem…</p>}
    {['pending','error','forbidden'].includes(result.status) &&
      <p role="alert">Chưa cập nhật được lịch chăm sóc. <Button onClick={result.retry}>Thử lại</Button></p>}
    {visit && <section>
      <h2>{visit.state === 'IN_PROGRESS' ? 'Đang chăm sóc' : visit.overdue ? 'Buổi cần theo dõi' : 'Buổi tiếp theo'}</h2>
      <ul className="pwc-mobile-rows"><MobileVisitCard row={visit} actionLabel={visit.state === 'IN_PROGRESS' ? 'Theo dõi buổi chăm sóc' : undefined} /></ul>
    </section>}
    {typeof awaitingPayment === 'number' && awaitingPayment > 0 &&
      <p><Link to="/account/bookings?view=orders">{awaitingPayment} đơn đang chờ thanh toán</Link></p>}
    {result.status === 'success' && !visit && <p>Bạn chưa có buổi chăm sóc sắp diễn ra.</p>}
    <MobileServiceChoices loadCatalog={loadCatalog} />
  </section>;
}
