import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterApplicationAdminApi } from '../../services/sitter-application-api.js';
import './sitter-applications.css';

const STATES = [['', 'Tất cả hồ sơ'], ['PENDING', 'Chờ xem xét'], ['UNDER_REVIEW', 'Đang thẩm định'],
  ['INTERVIEW', 'Phỏng vấn'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Đã từ chối']];
const EMPLOYMENT = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian' };
function StateLabel({ state }) {
  return <span className={`sitter-app-state sitter-app-state--${state.toLowerCase()}`}>{STATES.find(([value]) => value === state)?.[1] ?? state}</span>;
}
function dateText(value) {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
}
export function SitterApplicationsPage({ api = sitterApplicationAdminApi }) {
  const [stateFilter, setStateFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const load = useCallback(({ signal }) => api.list({ signal, state: stateFilter, search, employmentType, cursor }), [api, stateFilter, search, employmentType, cursor]);
  const resource = useApiResource(load);
  const data = resource.data;
  function filter(setter, value) { setter(value); setCursor(''); setHistory([]); }
  function reset() { setStateFilter(''); setSearch(''); setEmploymentType(''); setCursor(''); setHistory([]); }
  function nextPage() { setHistory(previous => [...previous, cursor]); setCursor(data.nextCursor); }
  function previousPage() { setCursor(history.at(-1)); setHistory(previous => previous.slice(0, -1)); }
  return <main className="sitter-app-admin" aria-labelledby="sitter-app-admin-title">
    <header className="sitter-app-admin__header">
      <div><p className="sitter-app-admin__eyebrow">Paw World Care · Tuyển dụng</p>
        <h1 id="sitter-app-admin-title">Hồ sơ ứng tuyển Sitter</h1>
        <p>Theo dõi ứng viên từ tiếp nhận, thẩm định và phỏng vấn đến quyết định tuyển dụng.</p></div>
      <Button variant="secondary" onClick={resource.retry}>Làm mới danh sách</Button>
    </header>
    <section className="sitter-app-overview" aria-label="Tổng quan toàn bộ hồ sơ">
      {STATES.map(([value, label]) => <button type="button" key={value} aria-pressed={stateFilter === value}
        onClick={() => filter(setStateFilter, value)}>
        <span>{label}</span><strong>{value ? data?.summary?.byState?.[value] ?? '—' : data?.summary?.total ?? '—'}</strong>
      </button>)}
    </section>
    <section className="sitter-app-admin__filters" aria-label="Bộ lọc hồ sơ">
      <label className="sitter-app-admin__search" htmlFor="sitter-app-search"><span>Tìm theo tên</span>
        <input id="sitter-app-search" type="search" maxLength="100" placeholder="Nhập tên ứng viên…" value={search}
          onChange={event => filter(setSearch, event.target.value)} /></label>
      <Select label="Trạng thái" value={stateFilter} onChange={event => filter(setStateFilter, event.target.value)}>
        {STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Select label="Hình thức làm việc" value={employmentType} onChange={event => filter(setEmploymentType, event.target.value)}>
        <option value="">Tất cả hình thức</option>{Object.entries(EMPLOYMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Button variant="ghost" onClick={reset}>Xóa bộ lọc</Button>
    </section>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải hồ sơ">Đang đọc danh sách từ máy chủ.</Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Yêu cầu đang xử lý">Máy chủ chưa xác nhận trạng thái danh sách.</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền">Chỉ Admin được xem và xét duyệt hồ sơ ứng tuyển.</Notice>}
    {resource.status === 'error' && <Notice state="error" title="Tải danh sách thất bại">Chưa thể tải hồ sơ. Kiểm tra phiên đăng nhập rồi thử lại.
      <Button variant="secondary" onClick={resource.retry}>Thử lại</Button></Notice>}
    {resource.status === 'success' && <section className="sitter-app-directory" aria-label="Danh sách hồ sơ ứng tuyển">
      <div className="sitter-app-directory__heading"><h2>Danh sách ứng viên</h2>
        <p>{Number.isSafeInteger(data.totalMatching) ? `${data.totalMatching} hồ sơ phù hợp` : `${data.applications.length} hồ sơ trên trang`} · Mới nhất trước</p></div>
      {!data.applications.length ? <Notice state="empty" title="Chưa có hồ sơ">Không tìm thấy hồ sơ phù hợp bộ lọc.</Notice>
        : <table className="sitter-app-table"><caption className="pwc-visually-hidden">Hồ sơ ứng tuyển, liên hệ được che và trạng thái xét duyệt</caption>
          <thead><tr><th scope="col">Ứng viên</th><th scope="col">Công việc mong muốn</th><th scope="col">Trạng thái</th><th scope="col">Thời gian</th><th scope="col">Thao tác</th></tr></thead>
          <tbody>{data.applications.map(application => <tr key={application.id}>
            <td data-label="Ứng viên"><Link className="sitter-app-name" to={`/admin/sitter-applications/${application.id}`}>{application.displayName}</Link>
              <small>{application.contact.maskedValue} · {application.contact.channel === 'EMAIL' ? 'Email' : 'Điện thoại'}</small>
              <small>{application.ageEligible === true ? 'Đủ điều kiện tuổi' : 'Tuổi chưa xác nhận'}</small></td>
            <td data-label="Công việc"><strong>{EMPLOYMENT[application.employmentType] ?? 'Chưa cung cấp hình thức'}</strong>
              <small>{application.requestedServices?.join(' · ') || 'Chưa có dịch vụ'}</small>
              <small>Khu vực: {application.workAreas.join(' · ')}</small></td>
            <td data-label="Trạng thái"><StateLabel state={application.state} /></td>
            <td data-label="Thời gian"><small>Nộp: <time dateTime={application.createdAt}>{dateText(application.createdAt)}</time></small>
              <small>Cập nhật: <time dateTime={application.updatedAt}>{dateText(application.updatedAt)}</time></small></td>
            <td data-label="Thao tác"><Link className="sitter-app-open" to={`/admin/sitter-applications/${application.id}`} aria-label={`Xem hồ sơ ${application.displayName}`}>Xem hồ sơ →</Link></td>
          </tr>)}</tbody>
        </table>}
      <nav className="sitter-app-pagination" aria-label="Phân trang hồ sơ">
        <Button variant="secondary" disabled={!history.length} onClick={previousPage}>Trang trước</Button>
        <span>Trang {history.length + 1}</span>
        <Button variant="secondary" disabled={!data.nextCursor} onClick={nextPage}>Trang sau</Button>
      </nav>
      <p className="sitter-app-private-note">Liên hệ được che trong danh sách. Chỉ mở giấy tờ riêng tư khi cần thẩm định; mọi lượt xem đều được ghi nhận.</p>
    </section>}
    {resource.status === 'empty' && <Notice state="empty" title="Chưa có hồ sơ">Không tìm thấy hồ sơ phù hợp bộ lọc.</Notice>}
  </main>;
}
export { StateLabel };
