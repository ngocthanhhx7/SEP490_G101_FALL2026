import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';
import { SitterVisitCard } from './SitterVisitCard.jsx';
import { Button, Input, Notice } from '../../components/ui/index.js';

const localDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
function todayInVietnam() {
  const parts = Object.fromEntries(localDay.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function SitterSchedulePage({ api = sitterDashboardApi }) {
  const [query, setQuery] = useSearchParams();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.get('day') ?? '') ? query.get('day') : todayInVietnam();
  const cursor = query.get('cursor') || undefined;
  const load = useCallback(({ signal }) => api.read({ group: 'agenda', from: day, to: day, limit: 20, ...(cursor && { cursor }), signal }),
    [api, day, cursor]);
  const result = useApiResource(load);
  function shiftDay(amount) {
    const date = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime())) return;
    date.setUTCDate(date.getUTCDate() + amount);
    setQuery({ day: date.toISOString().slice(0, 10) });
  }
  const back = '/sitter/schedule' + (query.size ? '?' + query.toString() : '');
  return <section className="pwc-mobile-screen sitter-workspace">
    <h1 data-duplicate-title>Ca làm</h1>
    <div className="sitter-workspace__filter">
      <Input label="Ngày xem · Giờ Việt Nam" type="date" value={day} onChange={event => {
        if (event.target.value) setQuery({ day: event.target.value });
      }} />
      <div className="sitter-workspace__controls">
        <Button variant="secondary" aria-label="Ngày trước" onClick={() => shiftDay(-1)}><ChevronLeft size={18} /></Button>
        <Button variant="secondary" onClick={() => setQuery({ day: todayInVietnam() })}>Hôm nay</Button>
        <Button variant="secondary" aria-label="Ngày sau" onClick={() => shiftDay(1)}><ChevronRight size={18} /></Button>
      </div>
    </div>
    <section aria-labelledby="sitter-agenda-title">
      <h2 id="sitter-agenda-title">Ca đã nhận</h2>
      {result.status === 'loading' && <Notice state="loading" title="Đang tải ca làm" />}
      {['pending', 'error', 'forbidden'].includes(result.status) && <Notice state="error" title="Chưa tải được ca ngày này"
        action={<Button variant="secondary" onClick={result.retry}>Thử lại</Button>} />}
      {result.status === 'success' && result.data.items.length > 0 && <ul className="sitter-workspace__list">
        {result.data.items.map(visit => <li key={visit.id}><SitterVisitCard visit={visit} back={back} /></li>)}
      </ul>}
      {['success', 'empty'].includes(result.status) && !result.data?.items?.length && <CompactEmpty icon={CalendarDays}
        title={cursor ? 'Trang này không còn ca' : 'Chưa có ca trong ngày này'}>Chọn ngày khác để xem ca đã nhận.</CompactEmpty>}
      {(cursor || result.data?.nextCursor) && <div className="sitter-workspace__controls">
        {cursor && <Button variant="secondary" onClick={() => setQuery({ day })}>Về trang đầu</Button>}
        {result.data?.nextCursor && <Button variant="secondary" onClick={() => setQuery({ day, cursor: result.data.nextCursor })}>Trang tiếp</Button>}
      </div>}
    </section>
    <nav className="sitter-workspace__links" aria-label="Thiết lập lịch">
      <CompactRow icon={Clock3} to="/sitter/availability" state={{ mobileBack: back }}>Giờ nhận việc và điểm xuất phát</CompactRow>
      <CompactRow icon={MapPin} to="/sitter/work-areas" state={{ mobileBack: back }}>Khu vực làm việc</CompactRow>
    </nav>
  </section>;
}
