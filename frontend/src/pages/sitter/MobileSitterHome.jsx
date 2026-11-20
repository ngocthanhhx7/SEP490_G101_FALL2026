import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
import { Button } from '../../components/ui/index.js';

const format = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });

export function MobileSitterHome({ api = sitterDashboardApi }) {
  const load = useCallback(({ signal }) => api.read({ group: 'next', limit: 1, signal }), [api]);
  const result = useApiResource(load);
  const visit = result.data?.items?.[0];
  const offers = result.data?.metrics?.find(metric => metric.key === 'pendingOffers')?.value;
  return <section className="pwc-mobile-screen">
    <h1>Hôm nay</h1>
    {result.status === 'loading' && <p role="status">Đang tìm ca cần xem…</p>}
    {['error', 'pending', 'forbidden'].includes(result.status) &&
      <p role="alert">Chưa cập nhật được ca làm. <Button onClick={result.retry}>Thử lại</Button></p>}
    {visit && <section>
      <h2>{visit.state === 'IN_PROGRESS' ? 'Ca đang thực hiện' : visit.overdue ? 'Ca cần theo dõi' : 'Ca tiếp theo'}</h2>
      <ul className="pwc-mobile-rows"><li>
        <strong>{visit.serviceName || 'Buổi chăm sóc'}</strong>
        <p>{format.format(new Date(visit.startsAt))} · Giờ Việt Nam</p>
        <Link to={'/sitter/visits/' + visit.id} state={{ mobileBack: '/sitter' }}>
          {visit.state === 'IN_PROGRESS' ? 'Tiếp tục ca' : 'Mở ca'}
        </Link>
      </li></ul>
    </section>}
    {result.status === 'success' && !visit && <p>Chưa có ca đã giao cần thực hiện.</p>}
    <ul className="pwc-mobile-rows">
      <li><Link to="/sitter/schedule">Ca làm</Link></li>
      <li><Link to="/sitter/invitations">{offers > 0 ? offers + ' lời mời cần phản hồi' : 'Lời mời'}</Link></li>
      <li><Link to="/sitter/availability">Giờ nhận việc</Link></li>
    </ul>
  </section>;
}
