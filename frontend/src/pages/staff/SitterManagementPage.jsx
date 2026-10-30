import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, Search, RefreshCw, ChevronLeft, ChevronRight, RotateCcw, Users, UserCheck, PauseCircle, FileWarning } from 'lucide-react';
import { Button, Input, Select, Notice } from '../../components/ui/index.js';
import { RowActionMenu } from '../../components/common/RowActionMenu.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterLabel, managementDate } from '../../utils/sitter-management-format.js';
import '../../styles/workspaces.css';
import './sitter-management.css';

const initial = { search: '', status: '', area: '', employmentType: '', source: 'ALL', profileState: '' };
export function ManagementState({ resource, title }) {
  if (resource.status === 'success') return null;
  return <Notice state={resource.status === 'empty' ? 'pending' : resource.status} title={resource.status === 'loading' ? 'Đang tải ' + title : 'Chưa tải được ' + title}
    action={resource.status !== 'loading' && <Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />;
}
export function SitterStatus({ value }) { return <span className={'workspace-status workspace-status--' + value}>{sitterLabel(value)}</span>; }
export function SitterManagementPage({ api }) {
  const navigate = useNavigate();
  const location = useLocation(), base = location.pathname.startsWith('/admin') ? '/admin/sitters' : '/staff/sitters';
  const [draft, setDraft] = useState(initial), [filters, setFilters] = useState(initial), [days, setDays] = useState(30);
  const [cursor, setCursor] = useState(''), [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(options => api.list({ ...filters, cursor, limit: 20 }, options), [api, filters, cursor]);
  const loadReports = useCallback(options => api.reports({ ...filters, days }, options), [api, filters, days]);
  const list = useApiResource(load), reports = useApiResource(loadReports), data = list.data, report = reports.data;
  const areaNames = useMemo(() => new Map((data?.areas ?? []).map(a => [a.code, a.label])), [data]);
  const areaName = code => areaNames.get(code) ?? code;
  function apply(value) { setFilters(value); setCursor(''); setHistory([]); }
  const metrics = report ? [
    ['Người chăm sóc', report.counts.total, Users], ['Đang hoạt động', report.counts.active, UserCheck],
    ['Tạm ngưng', report.counts.suspended, PauseCircle], ['Thiếu hợp đồng hiệu lực', report.counts.missingContract, FileWarning]
  ] : [];
  return <div className="workspace-page sitter-management">
    <header className="workspace-page-heading"><div><h1>Quản lý người chăm sóc</h1>
      <p>{report ? `${report.counts.real} hồ sơ thực · ${report.counts.demo} hồ sơ Demo` : 'Hồ sơ và hoạt động chăm sóc'}</p></div>
      <div className="workspace-heading-actions"><Button variant="secondary" onClick={() => { list.retry(); reports.retry(); }}><RefreshCw size={16} />Làm mới</Button></div>
    </header>
    <form className="sitter-management-filters" onSubmit={event => { event.preventDefault(); apply(draft); }}>
      <Input label="Tìm người chăm sóc" type="search" maxLength={100} value={draft.search} onChange={e => setDraft({ ...draft, search: e.target.value })} />
      <Select label="Hoạt động" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
        <option value="">Tất cả trạng thái</option>{['ACTIVE', 'SUSPENDED', 'MISSING'].map(s => <option key={s} value={s}>{sitterLabel(s)}</option>)}</Select>
      <Select label="Khu vực" value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })}><option value="">Tất cả khu vực</option>
        {(data?.areas ?? []).map(a => <option key={a.code} value={a.code}>{a.label}</option>)}</Select>
      <Select label="Hợp đồng hiệu lực" value={draft.employmentType} onChange={e => setDraft({ ...draft, employmentType: e.target.value })}><option value="">Tất cả</option>
        {['FULL_TIME', 'PART_TIME', 'MISSING', 'AMBIGUOUS'].map(s => <option key={s} value={s}>{sitterLabel(s)}</option>)}</Select>
      <Select label="Hồ sơ công khai" value={draft.profileState} onChange={e => setDraft({ ...draft, profileState: e.target.value })}><option value="">Tất cả</option>
        {['APPROVED', 'SUBMITTED', 'REJECTED', 'MISSING'].map(s => <option key={s} value={s}>{sitterLabel(s)}</option>)}</Select>
      <Select label="Nguồn dữ liệu" value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })}>
        <option value="ALL">Tất cả nguồn</option><option value="REAL">Hồ sơ thực</option><option value="DEMO">Hồ sơ Demo</option></Select>
      <div className="sitter-filter-actions"><Button type="submit"><Search size={16} />Lọc</Button>
        <button type="button" className="workspace-icon-button" aria-label="Xóa bộ lọc" title="Xóa bộ lọc" onClick={() => { setDraft(initial); apply(initial); }}><RotateCcw size={17} /></button></div>
    </form>
    <section aria-label="Báo cáo người chăm sóc" className="sitter-report">
      <ManagementState resource={reports} title="báo cáo" />
      {reports.status === 'success' && <>
        <dl className="workspace-metrics">{metrics.map(([label, value, Icon], i) => <div key={label}>
          <span className={'workspace-metric-icon workspace-metric-icon--' + i}><Icon size={21} /></span><div><dt>{label}</dt><dd>{value.toLocaleString('vi-VN')}</dd></div></div>)}</dl>
        <details className="sitter-report-details" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Báo cáo công việc và phân bố khu vực</summary>
          <div className="workspace-analytics-toolbar"><span>{report.from} đến {report.to}</span>
            <div className="workspace-period" role="group" aria-label="Kỳ báo cáo">{[7, 30, 90].map(d => <button type="button" key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} ngày</button>)}</div></div>
          <div className="sitter-report-columns"><section><h2>Buổi chăm sóc trong kỳ</h2>
            {!report.visitsAvailable ? <p role="status">Nguồn báo cáo công việc chưa sẵn sàng.</p> : report.work.length
              ? <dl className="sitter-work-counts">{report.work.map(w => <div key={w.state}><dt>{sitterLabel(w.state)}</dt><dd>{w.count}</dd></div>)}</dl>
              : <p className="workspace-empty">Chưa có buổi chăm sóc trong kỳ</p>}</section>
            <section><h2>Phân bố khu vực hiện tại</h2>{report.coverage.length ? <ul className="sitter-coverage">{report.coverage.map(a => <li key={a.code}><span>{areaName(a.code)}</span>
              <meter aria-label={areaName(a.code)} min={0} max={Math.max(1, report.counts.total)} value={a.count} /><strong>{a.count}</strong></li>)}</ul> : <p>Chưa đăng ký khu vực</p>}</section></div>
        </details><p className="workspace-updated">Cập nhật {managementDate(report.asOf)} · Giờ Việt Nam</p>
      </>}
    </section>
    <section aria-label="Danh sách người chăm sóc"><ManagementState resource={list} title="danh sách" />
      {list.status === 'success' && <><div className="sitter-table-caption"><h2>Người chăm sóc <span>{data.total}</span></h2></div>
        <div className="workspace-table-wrap" tabIndex={0} aria-label="Bảng người chăm sóc"><table className="workspace-table sitter-table"><thead><tr>
          <th scope="col">Người chăm sóc</th><th scope="col">Hoạt động</th><th scope="col">Hợp đồng hiệu lực</th><th scope="col">Khu vực / năng lực</th><th scope="col">Hồ sơ công khai</th><th scope="col">Thao tác</th>
        </tr></thead><tbody>{data.items.length ? data.items.map(s => <tr key={s.id}><td><Link className="sitter-name" to={base + '/' + s.id}>{s.displayName}</Link>
          <small>{s.demo ? 'Dữ liệu Demo' : 'Hồ sơ thực'} · {s.id.slice(-6).toUpperCase()}</small></td>
          <td><SitterStatus value={s.status} />{s.accountState !== 'ACTIVE' && <small>Tài khoản: {sitterLabel(s.accountState)}</small>}</td>
          <td>{sitterLabel(s.employmentType)}</td><td>{s.areas.length ? s.areas.slice(0, 2).map(areaName).join(', ') : 'Chưa đăng ký'}
            {s.areas.length > 2 && <small>+{s.areas.length - 2} khu vực</small>}<small>{s.capabilityActive ? 'Năng lực đã bật' : 'Năng lực chưa bật'}</small></td>
          <td><SitterStatus value={s.profileState} /></td><td><RowActionMenu label={'Thao tác ' + s.displayName} actions={[
            { label: 'Xem hồ sơ', icon: Eye, onClick: () => navigate(base + '/' + s.id) }
          ]} /></td></tr>)
          : <tr><td colSpan={6} className="workspace-empty">Không có người chăm sóc phù hợp.</td></tr>}</tbody></table></div>
        <div className="workspace-pagination"><span>Trang {history.length + 1} · {data.total} hồ sơ</span><div>
          <button type="button" className="workspace-icon-button" title="Trang trước" aria-label="Trang trước" disabled={!history.length} onClick={() => { const h = [...history]; setCursor(h.pop() ?? ''); setHistory(h); }}><ChevronLeft size={18} /></button>
          <button type="button" className="workspace-icon-button" title="Trang sau" aria-label="Trang sau" disabled={!data.nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}><ChevronRight size={18} /></button>
        </div></div></>}
    </section>
  </div>;
}
