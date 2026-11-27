import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import { Button } from '../../components/ui/index.js';
import { CalendarDays, ChevronRight, ClipboardList, Clock3, MapPin, PawPrint, UserRound } from 'lucide-react';
import { CompactEmpty, CompactRow } from '../../components/common/CompactSurface.jsx';
import './mobile-visit-agenda.css';

const groups = [['upcoming','Sắp tới'], ['ongoing','Cần theo dõi'], ['history','Lịch sử']];
const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full' });
const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const labels = { SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang chăm sóc',
  COMPLETED: 'Hoàn thành', STAFF_CLOSED: 'Đã đóng', CANCELLED: 'Đã hủy', SUPERSEDED: 'Đã thay thế' };
const tones = { SCHEDULED: 'waiting', ASSIGNED: 'active', IN_PROGRESS: 'active', COMPLETED: 'done' };
const locationLabels = new Map([['HOME', 'Tại nhà'], ['FACILITY', 'Tại trung tâm'], ['OUTDOOR', 'Ngoài trời']]);

export function MobileVisitCard({ row, mobileBack, actionLabel = 'Xem buổi chăm sóc', headingAs: Heading = 'h2' }) {
  const start = new Date(row.startsAt);
  const end = row.endsAt ? new Date(row.endsAt) : null;
  const hasEnd = end && end > start;
  const day = dateFormat.format(start);
  const endDay = hasEnd ? dateFormat.format(end) : null;
  const replaced = row.state === 'SUPERSEDED';
  const locationLabel = locationLabels.get(row.location);
  const destination = row.bookingId && (replaced ? `/account/bookings/${row.bookingId}` : `/account/bookings/${row.bookingId}/visits/${row.id}`);
  return <li className="pwc-visit-card">
    <div className="pwc-visit-card__heading">
      <Heading>{row.serviceDisplayName?.trim() || row.serviceName?.trim() || 'Buổi chăm sóc'}</Heading>
      <div className="pwc-visit-card__tags">
        {locationLabel && <span className="pwc-visit-card__location"><MapPin size={14} aria-hidden="true" />{locationLabel}</span>}
        <span className="pwc-visit-card__status" data-tone={tones[row.state] ?? 'neutral'}>{labels[row.state] ?? 'Đang cập nhật'}</span>
      </div>
    </div>
    <div className="pwc-visit-card__facts">
      <div className="pwc-visit-card__fact">
        <Clock3 size={17} aria-hidden="true" />
        <div>
          <div className="pwc-visit-card__time">
            <time dateTime={row.startsAt}>{timeFormat.format(start)}</time>
            {hasEnd && <> – <time dateTime={row.endsAt}>{timeFormat.format(end)}{endDay !== day && `, ${endDay}`}</time></>}
          </div>
          <div>{day} · Giờ Việt Nam</div>
        </div>
      </div>
      {row.petNames?.length > 0 && <div className="pwc-visit-card__fact"><PawPrint size={17} aria-hidden="true" /><span><strong>Thú cưng:</strong> {row.petNames.join(', ')}</span></div>}
      {row.sitterName && <div className="pwc-visit-card__fact"><UserRound size={17} aria-hidden="true" /><span><strong>Người chăm sóc:</strong> {row.sitterName}</span></div>}
    </div>
    {row.overdue && <p className="pwc-visit-card__note">Đã qua giờ bắt đầu. Lịch vẫn đang chờ cập nhật.</p>}
    {destination && <Link className={`pwc-compact-cta pwc-visit-card__action${replaced ? ' pwc-compact-cta--quiet' : ''}`}
      to={destination} state={{ mobileBack }}>
      <span>{replaced ? 'Xem lịch hẹn hiện tại' : actionLabel}</span><ChevronRight size={18} aria-hidden="true" />
    </Link>}
  </li>;
}

export function MobileVisitAgenda({ api = customerDashboardApi }) {
  const [query, changeQuery] = useSearchParams();
  const group = groups.some(([key]) => key === query.get('group')) ? query.get('group') : 'upcoming';
  const cursor = query.get('cursor');
  const load = useCallback(({ signal }) => api.read({ group, limit: 12, signal, ...(cursor && { cursor }) }), [api, group, cursor]);
  const result = useApiResource(load);
  return <section className="pwc-mobile-screen">
    <h1 data-duplicate-title>Lịch hẹn</h1>
    <div className="pwc-mobile-filter-bar pwc-visit-agenda__filters" role="group" aria-label="Lọc lịch hẹn">
      {groups.map(([key,label]) => <Button key={key} variant={key === group ? 'primary' : 'secondary'}
        aria-pressed={key === group} onClick={() => changeQuery({ group: key })}>{label}</Button>)}
    </div>
    {result.status === 'loading' && <p role="status">Đang tải lịch chăm sóc…</p>}
    {['pending','error','forbidden'].includes(result.status) &&
      <p role="alert">Chưa tải được lịch. <Button onClick={result.retry}>Thử lại</Button></p>}
    {result.status === 'success' && result.data.items.length > 0 && <ul className="pwc-mobile-rows">{result.data.items.map(row => <MobileVisitCard key={row.id} row={row}
      mobileBack={query.size ? `/account/bookings?${query.toString()}` : '/account/bookings'} />)}</ul>}
    {['success', 'empty'].includes(result.status) && !result.data?.items.length && <CompactEmpty icon={CalendarDays}
      title={cursor ? 'Trang này không còn kết quả' : group === 'upcoming' ? 'Chưa có lịch hẹn sắp tới' : 'Chưa có buổi trong nhóm này'}
      action={!cursor && group === 'upcoming' && <Link className="pwc-compact-cta" to="/services">Xem dịch vụ</Link>}>
      {!cursor && group === 'upcoming' ? 'Khi đặt dịch vụ, bạn có thể theo dõi lịch của bé tại đây.' : undefined}
    </CompactEmpty>}
    <div className="pwc-mobile-pager">
      {cursor && <Button onClick={() => changeQuery({ group })}>Về trang đầu</Button>}
      {result.data?.nextCursor && <Button onClick={() => changeQuery({ group, cursor: result.data.nextCursor })}>Xem trang tiếp</Button>}
    </div>
    <CompactRow icon={ClipboardList} to="/account/bookings?view=orders">Đơn chăm sóc</CompactRow>
  </section>;
}
