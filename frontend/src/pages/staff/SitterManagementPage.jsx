import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, Search, RefreshCw, RotateCcw, Users, UserCheck, PauseCircle, FileWarning } from 'lucide-react';
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
function AdminSitterManagementPage({ api }) {
  const navigate = useNavigate();
  const base = '/admin/sitters';
  const [draft, setDraft] = useState(initial), [filters, setFilters] = useState(initial), [days, setDays] = useState(30);
  const [cursor, setCursor] = useState(''), [history, setHistory] = useState([]);
  const load = useCallback(options => api.list({ ...filters, cursor, limit: 20 }, options), [api, filters, cursor]);
  const loadReports = useCallback(options => api.reports({ ...filters, days }, options), [api, filters, days]);
  const list = useApiResource(load), reports = useApiResource(loadReports), data = list.data, report = reports.data;
  const areaNames = useMemo(() => new Map((data?.areas ?? []).map(a => [a.code, a.label])), [data]);
  const areaName = code => areaNames.get(code) ?? code;
  function apply(value) { setFilters(value); setCursor(''); setHistory([]); }
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
        {['FULL_TIME', 'PART_TIME', 'MISSING'].map(s => <option key={s} value={s}>{sitterLabel(s)}</option>)}</Select>
      <Select label="Hồ sơ công khai" value={draft.profileState} onChange={e => setDraft({ ...draft, profileState: e.target.value })}><option value="">Tất cả</option>
        {['APPROVED', 'SUBMITTED', 'REJECTED', 'MISSING'].map(s => <option key={s} value={s}>{sitterLabel(s)}</option>)}</Select>
      <Select label="Nguồn dữ liệu" value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })}>
        <option value="ALL">Tất cả nguồn</option><option value="REAL">Hồ sơ thực</option><option value="DEMO">Hồ sơ Demo</option></Select>
      <div className="sitter-filter-actions"><Button type="submit"><Search size={16} />Lọc</Button>
        <button type="button" className="workspace-icon-button" aria-label="Xóa bộ lọc" title="Xóa bộ lọc" onClick={() => { setDraft(initial); apply(initial); }}><RotateCcw size={17} /></button></div>
    </form>
    <SitterReport resource={reports} areaName={areaName} days={days} setDays={setDays} showMetrics />
    <section aria-label="Danh sách người chăm sóc"><ManagementState resource={list} title="danh sách" />
      {list.status === 'success' && <><div className="sitter-table-caption"><h2>Người chăm sóc <span>{data.total}</span></h2></div>
        <div className="workspace-table-wrap" tabIndex={0} aria-label="Bảng người chăm sóc"><table className="workspace-table sitter-table"><thead><tr>
          <th scope="col">Người chăm sóc</th><th scope="col">Hoạt động</th><th scope="col">Hợp đồng hiệu lực</th><th scope="col">Khu vực / năng lực</th><th scope="col">Hồ sơ công khai</th><th scope="col">Thao tác</th>
        </tr></thead><tbody>{data.items.length ? data.items.map(s => <tr key={s.id}><td><Link className="sitter-name" to={base + '/' + s.id}>{s.displayName}</Link>
          <small>{s.demo ? 'Dữ liệu Demo' : 'Hồ sơ thực'} · {s.id.slice(-6).toUpperCase()}</small></td>
          <td><SitterStatus value={s.status} />{s.accountState !== 'ACTIVE' && <small>Tài khoản: {sitterLabel(s.accountState)}</small>}</td>
          <td>{s.upcomingContract ? <>{sitterLabel(s.upcomingContract.employmentType)}<small>Đã ký · Hiệu lực từ {managementDate(s.upcomingContract.effectiveAt)}</small></> : sitterLabel(s.employmentType)}</td><td>{s.areas.length ? s.areas.slice(0, 2).map(areaName).join(', ') : 'Chưa đăng ký'}
            {s.areas.length > 2 && <small>+{s.areas.length - 2} khu vực</small>}<small>{s.capabilityActive ? 'Năng lực đã bật' : 'Năng lực chưa bật'}</small></td>
          <td><SitterStatus value={s.profileState} /></td><td><RowActionMenu label={'Thao tác ' + s.displayName} actions={[
            { label: 'Xem hồ sơ', icon: Eye, onClick: () => navigate(base + '/' + s.id) }
          ]} /></td></tr>)
          : <tr><td colSpan={6} className="workspace-empty">Không có người chăm sóc phù hợp.</td></tr>}</tbody></table></div>
        <CursorPagination page={history.length + 1} label="người chăm sóc" hasNext onFirst={() => { setCursor(''); setHistory([]); }}
 onPrevious={() => { const h = [...history]; setCursor(h.pop() ?? ''); setHistory(h); }} onNext={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}
 previousDisabled={!history.length} nextDisabled={!data.nextCursor}
 previousLabel={"Trang trước"} nextLabel={"Trang sau"} summary={`${data.total} hồ sơ`} /></>}
    </section>
  </div>;
}

function SitterReport({ resource: reports, areaName, days, setDays, showMetrics = false }) {
  const [expanded, setExpanded] = useState(false);
  const report = reports.data;
  const metrics = showMetrics && report ? [
    ['Người chăm sóc', report.counts.total, Users], ['Đang hoạt động', report.counts.active, UserCheck],
    ['Tạm ngưng', report.counts.suspended, PauseCircle], ['Thiếu hợp đồng hiệu lực', report.counts.missingContract, FileWarning]
  ] : [];
  return <section aria-label="Báo cáo người chăm sóc" className="sitter-report">
      <ManagementState resource={reports} title="báo cáo" />
      {reports.status === 'success' && <>
        {showMetrics && <dl className="workspace-metrics">{metrics.map(([label, value, Icon], i) => <div key={label}>
          <span className={'workspace-metric-icon workspace-metric-icon--' + i}><Icon size={21} /></span><div><dt>{label}</dt><dd>{value.toLocaleString('vi-VN')}</dd></div></div>)}</dl>}
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
    </section>;
}

export function SitterManagementPage({ api }) {
  const { pathname } = useLocation();
  return pathname.startsWith('/admin') ? <AdminSitterManagementPage api={api} /> : <StaffSitterList api={api} />;
}

const STAFF_FILTERS = { search: '', area: '', employmentType: '', sort: 'rating', source: 'ALL', profileState: '' };
const STAFF_TABS = [['', 'Tất cả', 'all'], ['PART_TIME', 'Bán thời gian', 'partTime'], ['FULL_TIME', 'Toàn thời gian', 'fullTime']];
const STAFF_COLUMNS = ['Người chăm sóc', 'Hợp đồng', 'Khu vực phục vụ', 'Giờ làm hoặc ca', 'Ngày nghỉ',
  'Đánh giá', 'Rút buổi', 'Đến muộn', 'Xem'];
const RATING_FORMAT = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function MetricCount({ value }) {
  return value === null ? 'Chưa có dữ liệu' : <strong className={value >= 2 ? 'staff-sitter-count--alert' : undefined}>{value}</strong>;
}

function StaffHours({ sitter }) {
  if (sitter.employmentType === 'FULL_TIME') return 'Chưa có lịch ca';
  if (sitter.employmentType !== 'PART_TIME') return '—';
  if (!sitter.workingWindows.length) return 'Chưa đặt giờ làm';
  return sitter.workingWindows.map(window => <div key={window.weekday + '-' + window.startLocalTime}>
    {window.weekday === 7 ? 'CN' : 'T' + (window.weekday + 1)}: {window.startLocalTime}–{window.endLocalTime}
  </div>);
}

function StaffSitterList({ api }) {
  const [filters, setFilters] = useState(STAFF_FILTERS);
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState([]);
  const [days, setDays] = useState(30);
  const [catalog, setCatalog] = useState({});
  const load = useCallback(async options => {
    const result = await api.list({ ...filters, view: 'staffList', status: 'ACTIVE', cursor, limit: 20 }, options);
    if (!options.signal.aborted && result.data) {
      const { areas, tabCounts, withdrawalsAvailable } = result.data;
      setCatalog({ areas, tabCounts, withdrawalsAvailable });
    }
    return result;
  }, [api, filters, cursor]);
  const list = useApiResource(load);
  const loadReports = useCallback(options => api.reports({ days }, options), [api, days]);
  const reports = useApiResource(loadReports);
  const data = list.data;
  const { areas = [], tabCounts, withdrawalsAvailable } = list.status === 'loading' ? catalog : data ?? {};
  const areaNames = new Map(areas.map(area => [area.code, area.label]));
  const areaName = code => areaNames.get(code) ?? code;
  function firstPage() { setCursor(''); setHistory([]); }
  function changeFilter(key, value) {
    setFilters(previous => ({ ...previous, [key]: value }));
    firstPage();
  }

  return <main className="workspace-page sitter-management staff-sitter-list" aria-labelledby="staff-sitter-title">
    <header className="workspace-page-heading">
      <div><h1 id="staff-sitter-title">Người chăm sóc</h1>
        <p>Người chăm sóc đang làm việc, với hợp đồng, khu vực, lịch làm và kết quả 30 ngày gần nhất.</p></div>
      <Button variant="secondary" onClick={() => { list.retry(); reports.retry(); }}><RefreshCw size={16} />Làm mới</Button>
    </header>
    <section className="staff-sitter-tabs" aria-label="Lọc theo hợp đồng">
      {STAFF_TABS.map(([value, label, key]) => <button key={key} type="button"
        aria-pressed={filters.employmentType === value} onClick={() => changeFilter('employmentType', value)}>
        {label} ({tabCounts?.[key] ?? '—'})
      </button>)}
    </section>
    <section aria-label="Bộ lọc danh sách">
      <div className="staff-sitter-filters">
        <Input label="Tìm theo tên, mã hoặc số điện thoại" placeholder="Tìm theo tên, mã hoặc số điện thoại" type="search"
          maxLength={100} value={filters.search} onChange={event => changeFilter('search', event.target.value)} />
        <Select label="Khu vực phục vụ" value={filters.area} onChange={event => changeFilter('area', event.target.value)}>
          <option value="">Tất cả khu vực phục vụ</option>
          {areas.map(area => <option key={area.code} value={area.code}>{area.label}</option>)}
        </Select>
        <Select label="Sắp xếp" value={filters.sort} onChange={event => changeFilter('sort', event.target.value)}>
          <option value="rating">Sắp xếp: đánh giá</option>
          <option value="withdrawals" disabled={!withdrawalsAvailable}>Sắp xếp: rút buổi</option>
          <option value="lateCheckIns">Sắp xếp: đến muộn</option>
        </Select>
      </div>
      <details className="staff-sitter-extra">
        <summary>Bộ lọc bổ sung</summary>
        <div className="staff-sitter-extra__controls">
          <Select label="Hồ sơ công khai" value={filters.profileState} onChange={event => changeFilter('profileState', event.target.value)}>
            <option value="">Tất cả</option>
            {['APPROVED', 'SUBMITTED', 'REJECTED', 'MISSING'].map(state => <option key={state} value={state}>{sitterLabel(state)}</option>)}
          </Select>
          <Select label="Nguồn dữ liệu" value={filters.source} onChange={event => changeFilter('source', event.target.value)}>
            <option value="ALL">Tất cả nguồn</option><option value="REAL">Hồ sơ thực</option><option value="DEMO">Hồ sơ Demo</option>
          </Select>
        </div>
      </details>
    </section>
    <section aria-label="Danh sách người chăm sóc">
      <ManagementState resource={list} title="danh sách" />
      {list.status === 'success' && <div className="staff-sitter-directory">
        {data.items.length ? <table className="workspace-table staff-sitter-table">
          <caption className="pwc-visually-hidden">Danh sách người chăm sóc đang hoạt động</caption>
          <thead><tr>{STAFF_COLUMNS.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.items.map(sitter => <tr key={sitter.id}>
            <td data-label="Người chăm sóc"><strong>{sitter.displayName}</strong><small>{sitter.code}</small></td>
            <td data-label="Hợp đồng"><span className={'staff-sitter-contract staff-sitter-contract--' + sitter.employmentType}>
              {sitter.upcomingContract ? 'Đã ký · Hiệu lực từ ' + managementDate(sitter.upcomingContract.effectiveAt) : sitter.employmentType === 'MISSING' ? 'Chưa có hợp đồng' : sitterLabel(sitter.employmentType)}
            </span></td>
            <td data-label="Khu vực phục vụ">{sitter.areas.map(areaName).join(', ') || 'Chưa đăng ký'}</td>
            <td data-label="Giờ làm hoặc ca"><StaffHours sitter={sitter} /></td>
            <td data-label="Ngày nghỉ">Chưa có dữ liệu</td>
            <td data-label="Đánh giá">{sitter.rating === null ? 'Chưa có' : '★ ' + RATING_FORMAT.format(sitter.rating)}</td>
            <td data-label="Rút buổi"><MetricCount value={sitter.withdrawals} /></td>
            <td data-label="Đến muộn"><MetricCount value={sitter.lateCheckIns} /></td>
            <td data-label="Xem"><Link to={'/staff/sitters/' + sitter.id} aria-label={'Xem hồ sơ ' + sitter.displayName}>Xem</Link></td>
          </tr>)}</tbody>
        </table> : <p className="workspace-empty">Không có người chăm sóc phù hợp.</p>}
        <CursorPagination page={history.length + 1} label="người chăm sóc" hasNext={Boolean(data.nextCursor)}
          onFirst={firstPage} onPrevious={() => { setCursor(history.at(-1)); setHistory(history.slice(0, -1)); }}
          onNext={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}
          previousDisabled={!history.length} nextDisabled={!data.nextCursor}
          previousLabel="Trang trước" nextLabel="Trang sau" summary={data.total + ' người chăm sóc · 20 mỗi trang'} />
      </div>}
      <p className="staff-sitter-note">Rút buổi và Đến muộn: số lần trong 30 ngày gần nhất. Số từ 2 trở lên được tô đỏ. Ca của người toàn thời gian do Admin nhập trong lịch ca.</p>
    </section>
    <SitterReport resource={reports} areaName={areaName} days={days} setDays={setDays} />
  </main>;
}
