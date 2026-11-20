import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterDashboardApi } from '../../services/sitter-dashboard-api.js';
import { Button } from '../../components/ui/index.js';

const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
const localTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
const labels = { ASSIGNED: 'Đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn thành',
  STAFF_CLOSED: 'Đã đóng ca', CANCELLED: 'Đã hủy', SUPERSEDED: 'Đã thay thế' };
export function SitterSchedulePage({ api = sitterDashboardApi }) {
  const [query, setQuery] = useSearchParams();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.get('day') ?? '') ? query.get('day') : localDay.format(new Date());
  const cursor = query.get('cursor') || undefined;
  const load = useCallback(({ signal }) => api.read({ group: 'agenda', from: day, to: day, limit: 20, ...(cursor && { cursor }), signal }),
    [api, day, cursor]);
  const result = useApiResource(load);
  return <section className="pwc-mobile-screen">
    <h1>Ca làm</h1>
    <label>Ngày xem (giờ Việt Nam) <input type="date" value={day} onChange={event => {
      if (event.target.value) setQuery({ day: event.target.value });
    }} /></label>
    <p><Link to="/sitter/availability">Giờ nhận việc</Link> · <Link to="/sitter/invitations">Lời mời</Link></p>
    {result.status === 'loading' && <p role="status">Đang tải ca đã giao…</p>}
    {['pending','error','forbidden'].includes(result.status) && <p role="alert">Chưa tải được ca ngày này. <Button onClick={result.retry}>Thử lại</Button></p>}
    {result.status === 'success' && (result.data.items.length > 0 ? <ul className="pwc-mobile-rows">
      {result.data.items.map(visit => <li key={visit.id}><Link to={`/sitter/visits/${visit.id}`}
        state={{ mobileBack: '/sitter/schedule' + (query.size ? '?' + query.toString() : '') }}>
        <strong>{visit.serviceName || 'Buổi chăm sóc'}</strong><br /><time dateTime={visit.startsAt}>{localTime.format(new Date(visit.startsAt))}</time> · {labels[visit.state] ?? 'Đang cập nhật'}
        {visit.petNames?.length > 0 && <span className="pwc-visit-pets">{visit.petNames.join(', ')}</span>}
      </Link></li>)}
    </ul> : <p>{cursor ? 'Trang này không còn kết quả.' : 'Không có ca đã giao trong ngày này.'}</p>)}
    <div className="pwc-mobile-pager">
      {cursor && <Button onClick={() => setQuery({ day })}>Về trang đầu</Button>}
      {result.data?.nextCursor && <Button onClick={() => setQuery({ day, cursor: result.data.nextCursor })}>Xem trang tiếp</Button>}
    </div>
  </section>;
}
