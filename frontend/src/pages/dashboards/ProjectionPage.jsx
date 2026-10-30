import { useCallback, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import './projection-page.css';

const format = value => new Intl.NumberFormat('vi-VN').format(value);
const time = value => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
const labels = { COMPLETED: 'Hoàn thành', Completed: 'Hoàn thành', CANCELLED: 'Đã hủy',
  Cancelled: 'Đã hủy', ASSIGNED: 'Đã phân công', Assigned: 'Đã phân công', ACTIVE: 'Hoạt động',
  PENDING: 'Đang chờ', Submitted: 'Đã gửi', Approved: 'Đã duyệt, chưa xác nhận chuyển tiền',
  TransferPending: 'Đang đối soát chuyển tiền', Failed: 'Chuyển tiền thất bại', Rejected: 'Đã từ chối',
  Withdrawn: 'Đã rút', StaffClosed: 'Nhân viên đóng buổi', STAFF_CLOSED: 'Nhân viên đóng buổi', PAID: 'Đã quyết toán', Paid: 'Đã quyết toán' };
function ProjectionContent({ api, title, description, kind, targetId, searchable, filterDates = true }) {
  const [query, setQuery] = useState({});
  const [search, setSearch] = useState('');
  const [dates, setDates] = useState({ from: '', to: '' });
  const load = useCallback(({ signal }) => api.read({ ...query, targetId, signal }), [api, query, targetId]);
  const resource = useApiResource(load);
  const data = resource.data;
  return <section className="pwc-projection">
    <h1>{title}</h1><p>{description}</p>
    {(filterDates || searchable) && <form className="pwc-projection__filters" onSubmit={event => {
      event.preventDefault(); setQuery({ ...dates, ...(searchable ? { search } : {}) });
    }}>
      {filterDates && <><label>Từ ngày<input type="date" value={dates.from} onChange={event => setDates({ ...dates, from: event.target.value })} /></label>
      <label>Đến ngày<input type="date" min={dates.from || undefined} value={dates.to} onChange={event => setDates({ ...dates, to: event.target.value })} /></label></>}
      {searchable && <label>Tìm người chăm sóc<input type="search" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} /></label>}
      <Button type="submit">Áp dụng</Button>
    </form>}
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải dữ liệu" />}
    {resource.status === 'pending' && <Notice state="pending" title="Đang chờ tích hợp dữ liệu">Nguồn dữ liệu hoặc quyết định nghiệp vụ chưa sẵn sàng. Hãy thử lại sau.</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Bạn không có quyền xem dữ liệu này" />}
    {resource.status === 'error' && <Notice state="error" title="Không thể tải dữ liệu" action={<Button onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'success' && data && <>
      <p>Cập nhật {time(data.asOf)} (giờ Việt Nam)</p>
      {data.totalsScope === 'PAGE' && <p>Tổng các khoản trên trang hiện tại; không phải tổng toàn kỳ.</p>}
      <dl className="pwc-projection__metrics">{data.metrics.map(metric => <div key={metric.key}>
        <dt>{metric.label}</dt><dd>{format(metric.value)}{metric.currency === 'VND' ? ' VND' : ''}</dd>
      </div>)}</dl>
      {data.items.length === 0 && <Notice state="empty" title="Chưa có dữ liệu trong phạm vi đã chọn" />}
      <ul className="pwc-projection__items">{data.items.map(item => <li key={item.id}>
        <h2>{item.displayName ?? (item.bookingId ? `Đơn chăm sóc ${item.bookingId}`
          : item.visitId ? `Buổi chăm sóc ${item.visitId}` : `Mã ${item.id}`)}</h2>
        {item.state && <p>Trạng thái: {labels[item.state] ?? item.state}</p>}
        {item.startsAt && <p>Lịch chăm sóc: {time(item.startsAt)}</p>}
        {item.bio && <p>{item.bio}</p>}
        {item.areas && <p>Khu vực: {item.areas.join(', ')}</p>}
        {item.reviewCount !== undefined && <p>{item.reviewsAvailable === false ? 'Chưa có dữ liệu đánh giá đã xác minh' : item.reviewCount > 0 ? `${item.rating} / 5 (${item.reviewCount} đánh giá)` : 'Chưa có đánh giá'}</p>}
        {kind === 'earnings' && <>
          <dl>{[['accrued', 'Đã kiếm được'], ['pending', 'Chờ đủ điều kiện'], ['available', 'Khả dụng'], ['held', 'Đang giữ'], ['reserved', 'Đã dành tất toán'], ['paid', 'Đã quyết toán']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{format(item[key])} VND</dd></div>)}</dl>
          <p>{item.explanation}</p><p>Tham chiếu sổ: {item.ledgerReference}</p>
          {item.transferRecordedAt && <p>Ghi nhận chuyển khoản: {time(item.transferRecordedAt)}</p>}
        </>}
        {kind === 'payroll' && <p>{format(item.amountVnd)} VND — tuần yêu cầu {item.requestWeekKey}</p>}
      </li>)}</ul>
      <div className="pwc-projection__pagination">
        {query.cursor && <Button onClick={() => setQuery(({ cursor: _cursor, ...rest }) => rest)}>Về trang đầu</Button>}
        <Button disabled={!data.nextCursor} onClick={() => setQuery({ ...query, cursor: data.nextCursor })}>Trang tiếp</Button>
      </div>
    </>}
    {kind === 'earnings' && <p>Thu nhập không đồng nghĩa tiền đã chuyển. Khả dụng, đang giữ và khoản dành cho yêu cầu tất toán là các trạng thái riêng. Việc gửi yêu cầu tất toán thuộc luồng tất toán; trang này chỉ xem.</p>}
  </section>;
}
export function ProjectionPage({ roles, ...props }) {
  const session = useSession();
  if (session.status === 'loading') return <Notice state="loading" title="Đang kiểm tra phiên" />;
  if (session.status === 'pending') return <Notice state="pending" title="Đang chờ kết nối phiên" />;
  if (session.status !== 'authenticated' || !roles.some(role => session.user?.roles?.includes(role)
    || (role === 'STAFF' && session.user?.roles?.includes('ADMIN')))) {
    return <Notice state="forbidden" title="Bạn không có quyền xem dữ liệu này" />;
  }
  // Unmount private read state when identity changes, including same-role account switches.
  return <ProjectionContent key={session.user.id} {...props} />;
}
