import { useCallback } from 'react';
import { CalendarDays, ClipboardList, Clock3 } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
import { Button, Notice } from '../../components/ui/index.js';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';

import { SitterVisitCard } from './SitterVisitCard.jsx';

export function MobileSitterHome({ api = sitterDashboardApi }) {
  const load = useCallback(({ signal }) => api.read({ group: 'next', limit: 1, signal }), [api]);
  const result = useApiResource(load);
  const visit = result.data?.items?.[0];
  const offers = result.data?.metrics?.find(metric => metric.key === 'pendingOffers')?.value;
  return <section className="pwc-mobile-screen sitter-workspace">
    <h1 data-duplicate-title>Hôm nay</h1>
    {result.status === 'loading' && <Notice state="loading" title="Đang tìm ca cần xem…" />}
    {['error', 'pending', 'forbidden'].includes(result.status) &&
      <Notice state={result.status} title="Chưa cập nhật được ca làm"
        action={<Button variant="secondary" onClick={result.retry}>Thử lại</Button>} />}
    {visit && <section>
      <h2>{visit.state === 'IN_PROGRESS' ? 'Ca đang thực hiện' : visit.overdue ? 'Ca cần theo dõi' : 'Ca tiếp theo'}</h2>
      <SitterVisitCard visit={visit} back="/sitter" primary />
    </section>}
    {result.status === 'success' && !visit && <CompactEmpty icon={CalendarDays} title="Chưa có ca đã giao cần thực hiện">
      Khi có ca được giao, thông tin ca tiếp theo sẽ hiện ở đây.
    </CompactEmpty>}
    <nav className="sitter-workspace__links" aria-label="Công việc chăm sóc">
      <CompactRow icon={CalendarDays} to="/sitter/schedule">Ca làm</CompactRow>
      <CompactRow icon={ClipboardList} to="/sitter/invitations">{offers > 0 ? offers + ' lời mời cần phản hồi' : 'Lời mời'}</CompactRow>
      <CompactRow icon={Clock3} to="/sitter/availability" state={{ mobileBack: '/sitter' }}>Giờ nhận việc</CompactRow>
    </nav>
  </section>;
}
