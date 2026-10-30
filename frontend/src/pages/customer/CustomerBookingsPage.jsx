import { useCallback, useMemo, useState } from 'react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createApiClient, ApiError } from '../../services/api-client.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice } from '../../components/ui/index.js';
import './customer-bookings.css';

const labels = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', UNPAID: 'Chờ thanh toán', PAID: 'Đã thanh toán', AWAITING_PAYMENT: 'Chờ thanh toán trước', PAYMENT_EXPIRED: 'Hết hạn thanh toán', CARE_PLAN_PENDING: 'Chờ xác nhận kế hoạch', DISPATCH_PENDING: 'Chờ người chăm sóc', ASSIGNED: 'Đã phân công' };
export function CustomerBookingsPage({ request: suppliedRequest }) {
  const { getCsrfToken } = useSession();
  const request = useMemo(() => suppliedRequest || createApiClient({ getCsrfToken }), [suppliedRequest, getCsrfToken]);
  const [cursor, setCursor] = useState(null);
  const load = useCallback(async ({ signal }) => {
    const result = await request('/bookings?limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal });
    const items = Array.isArray(result.data) ? result.data : result.data?.items;
    if (!Array.isArray(items) || items.some(item => typeof item?.id !== 'string' || typeof item?.state !== 'string')) throw new ApiError('INVALID_RESPONSE');
    return { ...result, data: items, meta: { ...result.meta, nextCursor: result.data?.nextCursor ?? result.meta?.nextCursor ?? null } };
  }, [request, cursor]);
  const resource = useApiResource(load);
  return <section className="customer-bookings" aria-labelledby="customer-bookings-title">
    <h1 id="customer-bookings-title">Đơn hàng của bạn</h1><p>Tất cả lịch dịch vụ đã đặt, ở mọi trạng thái.</p>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn hàng">Vui lòng chờ máy chủ phản hồi.</Notice>}
    {resource.status === 'empty' && <Notice state="empty" title="Chưa có đơn hàng">Bạn chưa có đơn hàng trong trang kết quả này.</Notice>}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title="Chưa tải được đơn hàng">Máy chủ chưa cung cấp được danh sách. Hãy thử lại; trạng thái này không có nghĩa bạn chưa đặt đơn.<Button onClick={resource.retry}>Thử lại</Button></Notice>}
    {resource.status === 'success' && <ul className="customer-bookings__list">{resource.data.map(item => <li key={item.id}>
      <h2>{item.reference || item.id}</h2><p>{item.serviceName || 'Lịch chăm sóc thú cưng'}</p>
      <span>{labels[item.state] || item.state}</span>
      <a href={`/services?booking=${encodeURIComponent(item.id)}`}>Xem chi tiết</a>
    </li>)}</ul>}
    <div className="customer-bookings__pagination">
      {cursor && <Button variant="secondary" onClick={() => setCursor(null)}>Về đơn mới nhất</Button>}
      {resource.meta?.nextCursor && <Button onClick={() => setCursor(resource.meta.nextCursor)}>Xem đơn cũ hơn</Button>}
    </div>
  </section>;
}
