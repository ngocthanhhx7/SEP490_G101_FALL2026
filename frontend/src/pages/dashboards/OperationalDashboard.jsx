import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw, CalendarDays, ClipboardList, Wallet, Users } from 'lucide-react';
import { WorkspaceAnalytics } from '../../components/common/WorkspaceAnalytics.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { Notice, Button, Input, Select } from '../../components/ui/index.js';
import '../../styles/workspaces.css';

const config = {
  admin: { title: 'Tổng quan quản trị', links: [['Điều phối ca', '/staff/dispatch', CalendarDays], ['Hồ sơ ứng tuyển', '/admin/sitter-applications', ClipboardList], ['Quản lý người dùng', '/admin/users', Users], ['Lương nhân viên', '/admin/payroll', Wallet]] },
  staff: { title: 'Tổng quan điều phối', links: [['Điều phối ca', '/staff/dispatch', CalendarDays], ['Người chăm sóc', '/staff/sitters', Users], ['Duyệt hồ sơ công khai', '/staff/sitter-profiles', ClipboardList]] },
  sitter: { title: 'Công việc của tôi', links: [['Lời mời nhận việc', '/sitter/invitations', ClipboardList], ['Lịch làm việc', '/sitter/availability', CalendarDays], ['Lương và tạm ứng', '/sitter/payroll', Wallet]] },
  customer: { title: 'Chăm sóc của bạn', links: [['Đặt dịch vụ', '/services', CalendarDays], ['Đơn chăm sóc', '/account/bookings', ClipboardList], ['Thú cưng của tôi', '/account/pets', Users]] }
};
const states = { SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', STAFF_CLOSED: 'Đã đóng' };

function DashboardContent({ api, kind }) {
  const session = useSession(), settings = config[kind];
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', limit: 20 });
  const [draft, setDraft] = useState(filters);
  const load = useCallback(options => api.read({ ...options, ...filters, ...(cursor ? { cursor } : {}) }), [api, cursor, filters]);
  const resource = useApiResource(load), data = resource.data;
  const greeting = useMemo(() => session.user?.displayName?.split(' ').at(-1) ?? '', [session.user]);
  const target = kind === 'customer' ? '/account/bookings' : kind === 'sitter' ? '/sitter/invitations' : '/staff/dispatch';
  return <div className="workspace-page">
    <header className="workspace-page-heading"><div><h1>{settings.title}</h1>
      <p>{kind === 'customer' ? `Xin chào ${greeting}, cùng theo dõi lịch chăm sóc cho bé.` : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}</p></div>
      <Button variant="secondary" onClick={resource.retry} aria-label="Tải lại tổng quan"><RefreshCw size={17} />Tải lại</Button></header>
    <nav className="workspace-quick-links" aria-label="Truy cập nhanh">{settings.links.map(([label, to, Icon]) => <Link key={to} to={to}><Icon size={18} />{label}<ArrowRight size={15} /></Link>)}</nav>
    {kind !== 'customer' && <WorkspaceAnalytics key={session.user?.id} kind={kind} />}
    {resource.status === 'success' && data?.metrics?.length > 0 && <dl className="workspace-metrics workspace-metrics--queues">{data.metrics.map(row => <div key={row.key}><div><dt>{row.label}</dt><dd>{row.value.toLocaleString('vi-VN')}</dd></div></div>)}</dl>}
    <form className="workspace-table-toolbar" onSubmit={event => { event.preventDefault(); setCursor(''); setHistory([]); setFilters({ ...draft }); }}>
      <Input label="Từ ngày" type="date" value={draft.from} max={draft.to || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} />
      <Input label="Đến ngày" type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} />
      <Select label="Số dòng" value={draft.limit} onChange={event => setDraft({ ...draft, limit: Number(event.target.value) })}>{[10, 20, 50].map(value => <option key={value} value={value}>{value}</option>)}</Select>
      <Button type="submit" variant="secondary">Lọc lịch chăm sóc</Button>
    </form>
    {['loading', 'error', 'pending', 'forbidden'].includes(resource.status) && <Notice state={resource.status}
      title={resource.status === 'loading' ? 'Đang tải công việc' : resource.status === 'pending' ? 'Chưa có dữ liệu vận hành' : 'Chưa tải được công việc'}
      action={resource.status === 'error' ? <Button onClick={resource.retry}>Thử lại</Button> : undefined} />}
    {resource.status === 'success' && <section><div className="workspace-page-heading"><h2>{kind === 'customer' ? 'Lịch chăm sóc' : 'Danh sách buổi chăm sóc'}</h2><Link to={target}>Xem tất cả <ArrowRight size={15} /></Link></div>
      <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Buổi chăm sóc</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {data.items.map(row => <tr key={row.id}><td><strong>#{row.id.slice(-8).toUpperCase()}</strong></td>
          <td>{new Date(row.startsAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
          <td><span className={'workspace-status workspace-status--' + row.state}>{states[row.state] ?? row.state}</span></td>
          <td><Link to={target}>Mở công việc</Link></td></tr>)}
        {!data.items.length && <tr><td colSpan={4} className="workspace-empty">Chưa có buổi chăm sóc</td></tr>}
      </tbody></table></div>
      <div className="workspace-pagination"><span>Trang {history.length + 1}</span><div><Button variant="secondary" disabled={!history.length} onClick={() => { setCursor(history.at(-1)); setHistory(history.slice(0, -1)); }}>Trước</Button>
        <Button variant="secondary" disabled={!data.nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}>Tiếp theo</Button></div></div>
    </section>}
  </div>;
}

export function OperationalDashboard(props) {
  const session = useSession();
  const role = { admin: 'ADMIN', staff: 'STAFF', sitter: 'PET_SITTER', customer: 'CUSTOMER' }[props.kind];
  if (session.status === 'loading' || session.status === 'pending') return <Notice state={session.status} title="Đang kiểm tra phiên" />;
  if (session.status !== 'authenticated' || !(session.user?.roles?.includes(role) || (role === 'STAFF' && session.user?.roles?.includes('ADMIN')))) return <Notice state="forbidden" title="Bạn không có quyền xem dữ liệu này" />;
  return <DashboardContent key={session.user.id} {...props} />;
}
