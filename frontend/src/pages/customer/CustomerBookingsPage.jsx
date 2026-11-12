import { Link } from 'react-router-dom';
import { CalendarDays, PawPrint, ArrowUpRight } from 'lucide-react';
import { bookingStatus, bookingDate, bookingMoney } from '../../utils/booking-presentation.js';
import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useMemo, useState } from 'react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { listCustomerBookings } from '../../services/customer-bookings-api.js';
import { createApiClient } from '../../services/api-client.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice } from '../../components/ui/index.js';
import './customer-bookings.css';

export function CustomerBookingsPage({ request: suppliedRequest }) {
  const { getCsrfToken } = useSession();
  const request = useMemo(() => suppliedRequest || createApiClient({ getCsrfToken }), [suppliedRequest, getCsrfToken]);
  const [cursor, setCursor] = useState(null);
  const [history, setHistory] = useState([]);
  const load = useCallback(({ signal }) => listCustomerBookings(request, { signal, cursor }), [request, cursor]);
  const resource = useApiResource(load);
  return <section className="customer-bookings" aria-labelledby="customer-bookings-title">
    <h1 id="customer-bookings-title">Đơn chăm sóc của bạn</h1><p>Dịch vụ, thú cưng và lịch chăm sóc trong từng đơn. Các đơn mới nhất hiển thị trước.</p>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn hàng">Vui lòng chờ máy chủ phản hồi.</Notice>}
    {resource.status === 'empty' && <Notice state="empty" title="Chưa có đơn hàng">Bạn chưa có đơn hàng trong trang kết quả này.</Notice>}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title="Chưa tải được đơn hàng">Máy chủ chưa cung cấp được danh sách. Hãy thử lại; trạng thái này không có nghĩa bạn chưa đặt đơn.<Button onClick={resource.retry}>Thử lại</Button></Notice>}
    {resource.status === 'success' && <ul className="customer-bookings__list">{resource.data.map(item => <li key={item.id}>
      <div className="customer-bookings__card-heading"><div><p className="customer-bookings__reference" title={item.id}>Mã đơn: {item.reference || `#${item.id.slice(-8).toUpperCase()}`}</p>
        <h2>{item.serviceName || 'Lịch chăm sóc thú cưng'}</h2></div><strong className="customer-bookings__total">{bookingMoney(item.totalVnd)}</strong></div>
      <dl className="customer-bookings__facts"><div><dt><PawPrint size={17} aria-hidden="true" />Thú cưng</dt><dd>{item.petNames?.length ? item.petNames.join(', ') : 'Xem trong chi tiết'}</dd></div>
        <div><dt><CalendarDays size={17} aria-hidden="true" />Lịch đầu tiên</dt><dd>{bookingDate(item.firstVisitAt)}{item.visitCount > 0 && <small>{item.visitCount} buổi chăm sóc · Giờ Việt Nam</small>}</dd></div></dl>
      <p className="customer-bookings__hint">{bookingStatus(item.state)[1]}</p>
      <div className="customer-bookings__actions"><span className={`customer-bookings__status customer-bookings__status--${item.state.toLowerCase()}`}>{bookingStatus(item.state)[0]}</span>
        <Link className="customer-bookings__detail-button" to={`/account/bookings/${encodeURIComponent(item.id)}`} aria-label={`Xem chi tiết ${item.serviceName || 'đơn chăm sóc'} ${item.reference || item.id.slice(-8).toUpperCase()}`}>Xem chi tiết<ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </li>)}</ul>}
    <CursorPagination label="đơn chăm sóc" page={history.length + 1} hasNext={Boolean(resource.meta?.nextCursor)}
      onFirst={() => { setHistory([]); setCursor(null); }} onPrevious={() => { setCursor(history.at(-1)); setHistory(history.slice(0,-1)); }}
      onNext={() => { setHistory([...history,cursor]); setCursor(resource.meta.nextCursor); }} nextLabel="Xem đơn cũ hơn" />
  </section>;
}
