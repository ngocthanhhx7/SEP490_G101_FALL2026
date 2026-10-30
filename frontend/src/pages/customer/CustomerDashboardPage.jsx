import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, SlidersHorizontal, RefreshCw, PawPrint, Clock3 } from 'lucide-react';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { customerDashboardApi } from '../../services/customer-dashboard-api.js';
import './customer-home.css';

const states = { SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã có người chăm sóc', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', STAFF_CLOSED: 'Đã đóng' };
function CustomerCareOverview({ api }) {
  const { user } = useSession();
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [draft, setDraft] = useState(filters);
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const load = useCallback(({ signal }) => api.read({ signal, ...filters, limit: 10, ...(cursor ? { cursor } : {}) }), [api, filters, cursor]);
  const resource = useApiResource(load), data = resource.data;
  return <section className="customer-home" aria-labelledby="customer-home-title">
    <header className="customer-home__heading"><div><h1 id="customer-home-title">Chăm sóc của bạn</h1>
      <p>Xin chào {user.displayName?.split(' ').at(-1)}, hôm nay bạn và bé thế nào?</p></div>
      <Button variant="ghost" aria-label="Tải lại lịch chăm sóc" title="Tải lại lịch chăm sóc" onClick={resource.retry}><RefreshCw size={18} aria-hidden="true" /></Button>
    </header>
    <div className="customer-home__welcome"><div><span className="customer-home__eyebrow">DÀNH CHO BẠN VÀ BÉ</span><h2>Một lịch hẹn, thêm an tâm.</h2><p>Chọn dịch vụ và thời gian chăm sóc phù hợp với bé.</p>
      <Link className="customer-home__book" to="/services"><CalendarDays size={18} aria-hidden="true" />Đặt dịch vụ<ArrowRight size={16} aria-hidden="true" /></Link></div>
      <img src="/assets/services/grooming.webp" alt="Chăm sóc lông cho thú cưng" />
    </div>
    {resource.status === 'success' && <dl className="customer-home__summary">{data.metrics.map(metric => <div key={metric.key}><dt>{metric.label}</dt><dd>{metric.value.toLocaleString('vi-VN')}</dd></div>)}</dl>}
    <div className="customer-home__section-heading"><h2>Lịch chăm sóc</h2><Link to="/account/bookings">Tất cả đơn<ArrowRight size={15} aria-hidden="true" /></Link></div>
    <details className="customer-home__filters"><summary><SlidersHorizontal size={16} aria-hidden="true" />Lọc theo ngày{(filters.from || filters.to) && ' · Đang lọc'}</summary>
      <form onSubmit={event => { event.preventDefault(); setCursor(''); setHistory([]); setFilters({ ...draft }); }}>
        <Input label="Từ ngày" type="date" value={draft.from} max={draft.to || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} />
        <Input label="Đến ngày" type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} />
        <Button type="submit" variant="secondary">Áp dụng</Button><Button variant="ghost" onClick={() => { setDraft({ from: '', to: '' }); setFilters({ from: '', to: '' }); setCursor(''); setHistory([]); }}>Xóa lọc</Button>
      </form>
    </details>
    {['loading', 'error', 'pending', 'forbidden'].includes(resource.status) && <Notice state={resource.status}
      title={resource.status === 'loading' ? 'Đang tải lịch chăm sóc' : 'Chưa tải được lịch chăm sóc'}
      action={resource.status === 'error' ? <Button onClick={resource.retry}>Thử lại</Button> : undefined}>Thông tin sẽ hiển thị khi máy chủ xác nhận.</Notice>}
    {resource.status === 'success' && <>
      {data.items.length ? <ul className="customer-home__visits">{data.items.map(row => <li key={row.id}>
        <span className="customer-home__visit-icon"><Clock3 size={20} aria-hidden="true" /></span><div><strong>Buổi chăm sóc #{row.id.slice(-8).toUpperCase()}</strong>
          <time dateTime={row.startsAt}>{new Date(row.startsAt).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })}</time></div>
        <span className={'customer-home__status customer-home__status--' + row.state}>{states[row.state] ?? row.state}</span>
        <Link to="/account/bookings" aria-label={`Xem đơn của buổi ${row.id.slice(-8).toUpperCase()}`}><ArrowRight size={18} aria-hidden="true" /></Link>
      </li>)}</ul> : <div className="customer-home__empty"><CalendarDays size={32} aria-hidden="true" /><h3>Chưa có lịch chăm sóc</h3><p>{filters.from || filters.to ? 'Không có buổi chăm sóc trong khoảng ngày đã chọn.' : 'Lịch hẹn của bé sẽ xuất hiện tại đây sau khi bạn đặt dịch vụ.'}</p><Link to={filters.from || filters.to ? '/account/bookings' : '/services'}>{filters.from || filters.to ? 'Xem tất cả đơn chăm sóc' : 'Khám phá dịch vụ'}<ArrowRight size={15} aria-hidden="true" /></Link></div>}
      {(history.length > 0 || data.nextCursor) && <nav className="customer-home__pagination" aria-label="Phân trang lịch chăm sóc"><Button variant="secondary" disabled={!history.length} onClick={() => { setCursor(history.at(-1)); setHistory(history.slice(0, -1)); }}>Trước</Button><span>Trang {history.length + 1}</span><Button variant="secondary" disabled={!data.nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}>Tiếp theo</Button></nav>}
    </>}
    <Link className="customer-home__pet-link" to="/account/pets"><PawPrint size={20} aria-hidden="true" /><span>Thú cưng của tôi</span><ArrowRight size={16} aria-hidden="true" /></Link>
  </section>;
}
export function CustomerDashboardPage({ api = customerDashboardApi }) {
  const session = useSession();
  if (session.status === 'loading' || session.status === 'pending') return <Notice state={session.status} title="Đang kiểm tra phiên" />;
  if (session.status !== 'authenticated' || !session.user?.roles?.includes('CUSTOMER')) return <Notice state="forbidden" title="Bạn không có quyền xem lịch chăm sóc" />;
  return <CustomerCareOverview key={session.user.id} api={api} />;
}
