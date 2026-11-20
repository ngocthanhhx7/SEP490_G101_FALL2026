import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, Clock3 } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
import { Button, Notice } from '../../components/ui/index.js';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';

const format = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });

export function MobileSitterHome({ api = sitterDashboardApi }) {
  const load = useCallback(({ signal }) => api.read({ group: 'next', limit: 1, signal }), [api]);
  const result = useApiResource(load);
  const visit = result.data?.items?.[0];
  const offers = result.data?.metrics?.find(metric => metric.key === 'pendingOffers')?.value;
  return <section className="pwc-mobile-screen">
    <h1 data-duplicate-title>Hôm nay</h1>
    {result.status === 'loading' && <Notice state="loading" title="Đang tìm ca cần xem…" />}
    {['error', 'pending', 'forbidden'].includes(result.status) &&
      <Notice state={result.status} title="Chưa cập nhật được ca làm"
        action={<Button variant="secondary" onClick={result.retry}>Thử lại</Button>} />}
    {visit && <section>
      <h2>{visit.state === 'IN_PROGRESS' ? 'Ca đang thực hiện' : visit.overdue ? 'Ca cần theo dõi' : 'Ca tiếp theo'}</h2>
      <ul className="pwc-mobile-rows"><li>
        <strong>{visit.serviceName || 'Buổi chăm sóc'}</strong>
        <p>{format.format(new Date(visit.startsAt))} · Giờ Việt Nam</p>
        <Link className="pwc-compact-cta" to={'/sitter/visits/' + visit.id} state={{ mobileBack: '/sitter' }}>
          {visit.state === 'IN_PROGRESS' ? 'Tiếp tục ca' : 'Mở ca'}
        </Link>
      </li></ul>
    </section>}
    {result.status === 'success' && !visit && <CompactEmpty icon={CalendarDays} title="Chưa có ca đã giao cần thực hiện">
      Khi có ca được giao, thông tin ca tiếp theo sẽ hiện ở đây.
    </CompactEmpty>}
    <nav aria-label="Công việc chăm sóc">
      <CompactRow icon={CalendarDays} to="/sitter/schedule">Ca làm</CompactRow>
      <CompactRow icon={ClipboardList} to="/sitter/invitations">{offers > 0 ? offers + ' lời mời cần phản hồi' : 'Lời mời'}</CompactRow>
      <CompactRow icon={Clock3} to="/sitter/availability">Giờ nhận việc</CompactRow>
    </nav>
  </section>;
}
