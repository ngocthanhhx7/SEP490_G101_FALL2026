import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, SlidersHorizontal, RefreshCw, PawPrint, Clock3 } from 'lucide-react';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useUpcomingGrooming } from '../../hooks/useUpcomingGrooming.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import { createGroomingBookingApi } from '../../services/grooming-booking-api.js';
import { GroomingUpcomingRow } from '../../components/grooming/GroomingUpcomingRow.jsx';
import { GroomingCancelDialog } from '../../components/grooming/GroomingCancelDialog.jsx';
import './customer-home.css';

const states = { SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã có người chăm sóc', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', STAFF_CLOSED: 'Đã đóng' };
function CustomerCareOverview({ api, groomingApi, createGroomingApi }) {
  const { user, getCsrfToken } = useSession();
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [draft, setDraft] = useState(filters);
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const load = useCallback(({ signal }) => api.read({ signal, ...filters, limit: 10, ...(cursor ? { cursor } : {}) }), [api, filters, cursor]);
  const resource = useApiResource(load), data = resource.data;
  const grooming = useUpcomingGrooming({ enabled: true, getCsrfToken, api: groomingApi, createApi: createGroomingApi });
  const visibleGrooming = useMemo(() => {
    if (cursor) return [];
    return grooming.items.filter(item =>
      (!filters.from || item.slot.localDate >= filters.from) && (!filters.to || item.slot.localDate <= filters.to));
  }, [cursor, filters.from, filters.to, grooming.items]);
  const comingUp = useMemo(() => {
    const visits = resource.status === 'success' ? (data.items ?? []).map(row => ({
      kind: 'visit', key: `visit:${row.id}`, sortKey: Date.parse(row.startsAt) || 0, row
    })) : [];
    const spa = visibleGrooming.map(appointment => ({
      kind: 'grooming', key: `grooming:${appointment.id}`, sortKey: Date.parse(appointment.slot.startAt) || 0, appointment
    }));
    return [...visits, ...spa].sort((a, b) => a.sortKey - b.sortKey);
  }, [data, resource.status, visibleGrooming]);
  const refreshAll = () => {
    resource.retry();
    grooming.reload();
  };
  return <section className="customer-home" aria-labelledby="customer-home-title">
    <header className="customer-home__heading"><div><h1 id="customer-home-title">Chăm sóc của bạn</h1>
      <p>Xin chào {user.displayName?.split(' ').at(-1)}, hôm nay bạn và bé thế nào?</p></div>
      <Button variant="ghost" aria-label="Tải lại lịch chăm sóc" title="Tải lại lịch chăm sóc" onClick={refreshAll}><RefreshCw size={18} aria-hidden="true" /></Button>
    </header>
    <div className="customer-home__welcome"><div><span className="customer-home__eyebrow">DÀNH CHO BẠN VÀ BÉ</span><h2>Một lịch hẹn, thêm an tâm.</h2><p>Chọn dịch vụ và thời gian chăm sóc phù hợp với bé.</p>
      <Link className="customer-home__book" to="/services"><CalendarDays size={18} aria-hidden="true" />Đặt dịch vụ<ArrowRight size={16} aria-hidden="true" /></Link></div>
      <img src="/assets/services/grooming.webp" alt="Chăm sóc lông cho thú cưng" />
    </div>
    {resource.status === 'success' && <dl className="customer-home__summary">{data.metrics.map(metric => <div key={metric.key}><dt>{metric.label}</dt><dd>{metric.value.toLocaleString('vi-VN')}</dd></div>)}</dl>}
    <div className="customer-home__section-heading"><h2>Sắp tới</h2><Link to="/account/bookings">Tất cả đơn<ArrowRight size={15} aria-hidden="true" /></Link></div>
    {grooming.toastMessage && <p className="grooming-upcoming__toast" role="status">{grooming.toastMessage}</p>}
    <details className="customer-home__filters"><summary><SlidersHorizontal size={16} aria-hidden="true" />Lọc theo ngày{(filters.from || filters.to) && ' · Đang lọc'}</summary>
      <form onSubmit={event => { event.preventDefault(); setCursor(''); setHistory([]); setFilters({ ...draft }); }}>
        <Input label="Từ ngày" type="date" value={draft.from} max={draft.to || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} />
        <Input label="Đến ngày" type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} />
        <Button type="submit" variant="secondary">Áp dụng</Button><Button variant="ghost" onClick={() => { setDraft({ from: '', to: '' }); setFilters({ from: '', to: '' }); setCursor(''); setHistory([]); }}>Xóa lọc</Button>
      </form>
    </details>
    {['loading', 'error', 'pending', 'forbidden'].includes(resource.status) && <Notice state={resource.status}
      title={resource.status === 'loading' ? 'Đang tải lịch chăm sóc' : 'Chưa tải được lịch chăm sóc'}
      action={resource.status === 'error' ? <Button onClick={refreshAll}>Thử lại</Button> : undefined}>Thông tin sẽ hiển thị khi máy chủ xác nhận.</Notice>}
    {comingUp.length > 0 && <ul className="customer-home__visits">{comingUp.map(entry => (entry.kind === 'visit' ? <li key={entry.key}>
      <span className="customer-home__visit-icon"><Clock3 size={20} aria-hidden="true" /></span><div><strong>Buổi chăm sóc #{entry.row.id.slice(-8).toUpperCase()}</strong>
        <time dateTime={entry.row.startsAt}>{new Date(entry.row.startsAt).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })}</time></div>
      <span className={'customer-home__status customer-home__status--' + entry.row.state}>{states[entry.row.state] ?? entry.row.state}</span>
      <Link to="/account/bookings" aria-label={`Xem đơn của buổi ${entry.row.id.slice(-8).toUpperCase()}`}><ArrowRight size={18} aria-hidden="true" /></Link>
    </li> : <GroomingUpcomingRow
      key={entry.key}
      appointment={entry.appointment}
      busy={grooming.cancellingId === entry.appointment.id}
      inlineError={grooming.inlineErrors[entry.appointment.id] ?? ''}
      onCancel={grooming.requestCancel}
    />))}</ul>}
    {resource.status === 'success' && <>
      {comingUp.length === 0 && <div className="customer-home__empty"><CalendarDays size={32} aria-hidden="true" /><h3>Chưa có lịch chăm sóc</h3><p>{filters.from || filters.to ? 'Không có buổi chăm sóc trong khoảng ngày đã chọn.' : 'Lịch hẹn của bé sẽ xuất hiện tại đây sau khi bạn đặt dịch vụ.'}</p><Link to={filters.from || filters.to ? '/account/bookings' : '/services'}>{filters.from || filters.to ? 'Xem tất cả đơn chăm sóc' : 'Khám phá dịch vụ'}<ArrowRight size={15} aria-hidden="true" /></Link></div>}
      {(history.length > 0 || data.nextCursor) && <CursorPagination page={history.length + 1} label="lịch chăm sóc" hasNext onFirst={() => { setCursor(''); setHistory([]); }}
 onPrevious={() => { setCursor(history.at(-1)); setHistory(history.slice(0, -1)); }} onNext={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}
 previousDisabled={!history.length} nextDisabled={!data.nextCursor}
 previousLabel={"Trước"} nextLabel={"Tiếp theo"} />}
    </>}
    <Link className="customer-home__pet-link" to="/account/pets"><PawPrint size={20} aria-hidden="true" /><span>Thú cưng của tôi</span><ArrowRight size={16} aria-hidden="true" /></Link>
    <GroomingCancelDialog
      appointment={grooming.pendingCancel}
      busy={Boolean(grooming.cancellingId)}
      onConfirm={grooming.confirmCancel}
      onClose={grooming.closeCancelDialog}
    />
  </section>;
}
export function CustomerDashboardPage({ api = customerDashboardApi, groomingApi = null, createGroomingApi = createGroomingBookingApi }) {
  const session = useSession();
  if (session.status === 'loading' || session.status === 'pending') return <Notice state={session.status} title="Đang kiểm tra phiên" />;
  if (session.status !== 'authenticated' || !session.user?.roles?.includes('CUSTOMER')) return <Notice state="forbidden" title="Bạn không có quyền xem lịch chăm sóc" />;
  return <CustomerCareOverview key={session.user.id} api={api} groomingApi={groomingApi} createGroomingApi={createGroomingApi} />;
}
