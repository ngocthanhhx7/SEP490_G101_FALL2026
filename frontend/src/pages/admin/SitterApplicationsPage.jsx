import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterApplicationAdminApi } from '../../services/sitter-application-api.js';
import './sitter-applications.css';

const STATES = [
  ['', 'Tất cả trạng thái'], ['PENDING', 'Chờ xem xét'], ['UNDER_REVIEW', 'Đang thẩm định'],
  ['INTERVIEW', 'Phỏng vấn'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Đã từ chối']
];

function StateLabel({ state }) {
  const labels = { PENDING: 'Chờ xem xét', UNDER_REVIEW: 'Đang thẩm định', INTERVIEW: 'Phỏng vấn', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
  return <span className={`sitter-app-state sitter-app-state--${state.toLowerCase()}`}>{labels[state] ?? state}</span>;
}

function messageForError(code) {
  if (code === 'FORBIDDEN') return 'Tài khoản này không có quyền xem hồ sơ ứng tuyển.';
  if (code === 'UNAUTHENTICATED') return 'Phiên đăng nhập Admin đã hết hạn. Hãy đăng nhập lại.';
  return 'Không thể tải danh sách hồ sơ. Hãy thử lại.';
}

export function SitterApplicationsPage({ api = sitterApplicationAdminApi }) {
  const [stateFilter, setStateFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const load = useCallback(({ signal }) => api.list({ signal, state: stateFilter, search }), [api, stateFilter, search]);
  const resource = useApiResource(load);

  return <main className="sitter-app-admin" aria-labelledby="sitter-app-admin-title">
    <header className="sitter-app-admin__header">
      <div><p className="sitter-app-admin__eyebrow">Paw World Care · Quản trị</p>
        <h1 id="sitter-app-admin-title">Hồ sơ ứng tuyển Sitter</h1>
        <p>Chỉ Admin được xem thông tin liên hệ và mở giấy tờ riêng tư.</p></div>
      <Button variant="secondary" onClick={resource.retry}>Làm mới danh sách</Button>
    </header>

    <section className="sitter-app-admin__filters" aria-label="Bộ lọc hồ sơ">
      <Select label="Trạng thái" value={stateFilter} onChange={event => setStateFilter(event.target.value)}>
        {STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <label className="sitter-app-admin__search" htmlFor="sitter-app-search">
        <span>Tìm theo tên</span>
        <input id="sitter-app-search" type="search" maxLength="100" value={search}
          onChange={event => setSearch(event.target.value)} />
      </label>
    </section>

    {resource.status === 'loading' && <Notice state="loading" title="Đang tải hồ sơ"><p>Đang đọc danh sách từ máy chủ.</p></Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Yêu cầu đang xử lý"><p>Máy chủ chưa xác nhận trạng thái danh sách.</p></Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền"><p>{messageForError('FORBIDDEN')}</p></Notice>}
    {resource.status === 'error' && <Notice state="error" title="Tải danh sách thất bại"><p>{messageForError(resource.code)}</p>
      <Button variant="secondary" onClick={resource.retry}>Thử lại</Button></Notice>}
    {resource.status === 'empty' && <Notice state="empty" title="Chưa có hồ sơ"><p>Không tìm thấy hồ sơ phù hợp bộ lọc.</p></Notice>}

    {resource.status === 'success' && <div className="sitter-app-admin__list" aria-live="polite">
      {resource.data.applications.map(application => <article className="sitter-app-row" key={application.id}>
        <div className="sitter-app-row__main">
          <h2><Link to={`/admin/applications/${application.id}`}>{application.displayName}</Link></h2>
          <p>{application.contact.maskedValue} · {application.contact.channel === 'EMAIL' ? 'Email' : 'Điện thoại'}</p>
          <p>{application.workAreas.join(' · ')}</p>
        </div>
        <div className="sitter-app-row__meta"><StateLabel state={application.state} />
          <time dateTime={application.createdAt}>{new Date(application.createdAt).toLocaleDateString('vi-VN')}</time>
        </div>
      </article>)}
      {!resource.data.applications.length && <Notice state="empty" title="Chưa có hồ sơ"><p>Không tìm thấy hồ sơ phù hợp bộ lọc.</p></Notice>}
    </div>}
  </main>;
}

export { StateLabel };
