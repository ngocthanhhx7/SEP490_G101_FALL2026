import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { incidentApi } from '../../services/incident-api.js';
import './incidents.css';

const LABELS = { OPEN: 'Đang mở', UNDER_REVIEW: 'Đang xem xét', RESOLVED: 'Đã giải quyết', CLOSED: 'Đã đóng', LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Nghiêm trọng', ROUTINE: 'Thông thường', URGENT: 'Khẩn', EMERGENCY: 'Khẩn cấp' };
const label = value => LABELS[value] || value || 'Chưa xác định';
function formatDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date) : 'Chưa có thời điểm'; }

export function IncidentListPage({ api = incidentApi, initialFilters = {} }) {
  const [filters, setFilters] = useState({ state: '', urgency: '', visitId: '', ...initialFilters });
  const [query, setQuery] = useState(filters);
  const load = useCallback(({ signal }) => api.list({ ...query, signal }), [api, query]);
  const resource = useApiResource(load);
  const items = resource.data?.items || [];
  const apply = event => { event.preventDefault(); setQuery({ ...filters, cursor: '' }); };
  return <main className="incident-page incident-list" aria-labelledby="incident-list-title">
    <header className="incident-page__header"><p className="incident-page__eyebrow">PAW WORLD CARE · CASE</p><h1 id="incident-list-title">Danh sách sự cố</h1><p>Danh sách được lọc theo phạm vi phiên đăng nhập. Nội dung Staff riêng tư không xuất hiện trong projection Customer hoặc Sitter.</p></header>
    <form className="incident-card incident-filters" onSubmit={apply}><Select label="Trạng thái" value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value })}><option value="">Tất cả</option><option value="OPEN">Đang mở</option><option value="UNDER_REVIEW">Đang xem xét</option><option value="RESOLVED">Đã giải quyết</option><option value="CLOSED">Đã đóng</option></Select><Select label="Mức khẩn cấp" value={filters.urgency} onChange={event => setFilters({ ...filters, urgency: event.target.value })}><option value="">Tất cả</option><option value="ROUTINE">Thông thường</option><option value="URGENT">Khẩn</option><option value="EMERGENCY">Khẩn cấp</option></Select><Input label="Mã visit" value={filters.visitId} onChange={event => setFilters({ ...filters, visitId: event.target.value })} /><Button type="submit">Lọc</Button><Button variant="secondary" type="button" onClick={resource.retry}>Tải lại</Button></form>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải sự cố">Đang đọc projection theo quyền.</Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Đang chờ máy chủ">Dữ liệu chờ chưa được coi là danh sách đã xác nhận.</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem">Phạm vi phiên hiện tại không cho phép đọc danh sách này.</Notice>}
    {resource.status === 'error' && <Notice state="error" title="Không tải được danh sách" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Kiểm tra kết nối và quyền.</Notice>}
    {resource.status === 'empty' && <Notice state="empty" title="Chưa có sự cố">Không có sự cố phù hợp với bộ lọc.</Notice>}
    {resource.status === 'success' && <ol className="incident-list__items" aria-label="Các sự cố">{items.map(item => <li key={item.id} className="incident-card incident-list__item"><div><p className="incident-page__eyebrow">{item.category || 'SỰ CỐ'} · {item.id}</p><h2>{item.description || 'Sự cố cần xem chi tiết'}</h2><p>Visit {item.visitId} · {formatDate(item.createdAt)}</p></div><div className="incident-list__meta"><span className="incident-pill">{label(item.state)}</span><span className="incident-pill">{label(item.urgency || item.severity)}</span><Link className="pwc-button pwc-button--secondary" to={`/cases/${item.id}`}>Xem chi tiết</Link></div></li>)}</ol>}
  </main>;
}

export const IncidentsPage = IncidentListPage;
