import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import { Button } from '../../components/ui/index.js';

const groups = [['upcoming','Sắp tới'], ['ongoing','Đang chăm sóc'], ['history','Lịch sử']];
const format = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
const labels = { SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang chăm sóc',
  COMPLETED: 'Hoàn thành', STAFF_CLOSED: 'Đã đóng', CANCELLED: 'Đã hủy', SUPERSEDED: 'Đã thay thế' };

export function MobileVisitCard({ row, mobileBack, actionLabel = 'Xem buổi chăm sóc' }) {
  return <li>
    <strong>{row.serviceName || 'Buổi chăm sóc'}</strong>
    {row.petNames?.length > 0 && <p>{row.petNames.join(', ')}</p>}
    <p><time dateTime={row.startsAt}>{format.format(new Date(row.startsAt))}</time> · {labels[row.state] ?? 'Đang cập nhật'}</p>
    {row.sitterName && <p>Pet Sitter: {row.sitterName}</p>}
    {row.overdue && <p>Buổi đã qua giờ bắt đầu và đang chờ cập nhật.</p>}
    {row.bookingId && <Link to={`/account/bookings/${row.bookingId}/visits/${row.id}`} state={{ mobileBack }}>{actionLabel}</Link>}
  </li>;
}

export function MobileVisitAgenda({ api = customerDashboardApi }) {
  const [query, changeQuery] = useSearchParams();
  const group = groups.some(([key]) => key === query.get('group')) ? query.get('group') : 'upcoming';
  const cursor = query.get('cursor');
  const load = useCallback(({ signal }) => api.read({ group, limit: 12, signal, ...(cursor && { cursor }) }), [api, group, cursor]);
  const result = useApiResource(load);
  return <section className="pwc-mobile-screen">
    <h1>Lịch hẹn</h1>
    <div className="pwc-mobile-pager" role="group" aria-label="Lọc lịch hẹn">
      {groups.map(([key,label]) => <Button key={key} variant={key === group ? 'primary' : 'secondary'}
        aria-pressed={key === group} onClick={() => changeQuery({ group: key })}>{label}</Button>)}
    </div>
    {result.status === 'loading' && <p role="status">Đang tải lịch chăm sóc…</p>}
    {['pending','error','forbidden'].includes(result.status) &&
      <p role="alert">Chưa tải được lịch. <Button onClick={result.retry}>Thử lại</Button></p>}
    {result.status === 'success' && (result.data.items.length > 0
      ? <ul className="pwc-mobile-rows">{result.data.items.map(row => <MobileVisitCard key={row.id} row={row}
        mobileBack={`/account/bookings?${query.toString()}`} />)}</ul>
      : <p>{cursor ? 'Trang này không còn kết quả.' : 'Chưa có buổi trong nhóm này.'}</p>)}
    <div className="pwc-mobile-pager">
      {cursor && <Button onClick={() => changeQuery({ group })}>Về trang đầu</Button>}
      {result.data?.nextCursor && <Button onClick={() => changeQuery({ group, cursor: result.data.nextCursor })}>Xem trang tiếp</Button>}
    </div>
    <Link to="/account/bookings?view=orders">Xem danh sách đơn chăm sóc</Link>
  </section>;
}
