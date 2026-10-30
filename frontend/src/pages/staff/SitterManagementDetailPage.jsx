import { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CalendarDays, FileCheck2, PauseCircle, PlayCircle, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button, Dialog, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterLabel, managementDate, weekdayLabel } from '../../utils/sitter-management-format.js';
import { ManagementState, SitterStatus } from './SitterManagementPage.jsx';
import { EmployeeContractForm } from '../../components/payroll/EmployeeContractForm.jsx';
import './sitter-management.css';

function WorkHistory({ api, userId }) {
  const [days, setDays] = useState(30), [cursor, setCursor] = useState(''), [history, setHistory] = useState([]);
  const load = useCallback(options => api.activity(userId, { days, cursor, limit: 20 }, options), [api, userId, days, cursor]);
  const resource = useApiResource(load), data = resource.data;
  return <section aria-label="Lịch sử công việc"><div className="workspace-analytics-toolbar"><h2>Công việc trong kỳ</h2>
    <div className="workspace-period" role="group" aria-label="Kỳ lịch sử">{[7, 30, 90].map(d => <button type="button" key={d} aria-pressed={days === d}
      onClick={() => { setDays(d); setCursor(''); setHistory([]); }}>{d} ngày</button>)}</div></div>
    <ManagementState resource={resource} title="công việc" />
    {resource.status === 'success' && <><div className="workspace-table-wrap" tabIndex={0} aria-label="Bảng công việc"><table className="workspace-table"><thead><tr><th>Bắt đầu</th><th>Kết thúc</th><th>Dịch vụ</th><th>Trạng thái</th></tr></thead>
      <tbody>{data.items.length ? data.items.map(v => <tr key={v.id}><td>{managementDate(v.startAt)}</td><td>{managementDate(v.endAt)}</td>
        <td>{v.serviceName ?? 'Chưa có tên dịch vụ'}</td><td><SitterStatus value={v.state} /></td></tr>) : <tr><td colSpan={4} className="workspace-empty">Chưa có công việc trong kỳ.</td></tr>}</tbody></table></div>
      <div className="workspace-pagination"><span>{data.from} đến {data.to} · Trang {history.length + 1}</span><div>
        <button className="workspace-icon-button" title="Trang công việc trước" aria-label="Trang công việc trước" disabled={!history.length} onClick={() => { const h = [...history]; setCursor(h.pop() ?? ''); setHistory(h); }}><ChevronLeft size={18} /></button>
        <button className="workspace-icon-button" title="Trang công việc sau" aria-label="Trang công việc sau" disabled={!data.nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(data.nextCursor); }}><ChevronRight size={18} /></button>
      </div></div></>}
  </section>;
}

function ContractDialog({ data, api, onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [locked, setLocked] = useState(false);
  const operation = useRef(null), inFlight = useRef(false);
  async function save(body) {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setMessage(null);
    if (!operation.current) operation.current = { body, key: `payroll:${globalThis.crypto.randomUUID()}` };
    try {
      const result = await api.contract(operation.current.body, operation.current.key);
      if (!result?.id || result.version !== operation.current.body.expectedVersion + 1) throw { code: 'INVALID_RESPONSE' };
      onSaved();
      return true;
    } catch (error) {
      const uncertain = !error.status || error.status >= 500 || ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code);
      setLocked(uncertain);
      if (!uncertain) operation.current = null;
      setMessage(error.code === 'VERSION_CONFLICT' ? 'Hợp đồng đã thay đổi. Đóng và tải lại hồ sơ để lấy phiên bản mới.'
        : error.code === 'BELOW_MINIMUM_WAGE' ? 'Thời lượng làm việc vượt mức được hỗ trợ bởi lương hợp đồng. Kiểm tra thời lượng và vùng lương.'
          : error.status === 422 ? 'Thông tin hợp đồng chưa hợp lệ. Kiểm tra ngày, thời lượng và căn cứ hợp đồng.'
            : error.status === 403 ? 'Phiên hiện tại không có quyền xác minh hợp đồng.'
              : uncertain ? 'Chưa nhận được xác nhận. Kiểm tra lại cùng yêu cầu hoặc đóng và tải lại hồ sơ trước khi tạo yêu cầu mới.'
                : 'Chưa lưu được hợp đồng. Kiểm tra trạng thái nhân viên và chính sách lương.');
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <Dialog open title="Xác minh hợp đồng đã ký" onClose={onClose} dismissible={!busy} className="workspace-dialog">
    <p>{data.displayName}</p>
    <p>Ghi nhận thông tin từ hợp đồng đã ký. Hợp đồng chỉ có hiệu lực trong khoảng thời gian đã xác minh.</p>
    {message && <Notice state="error" title="Chưa lưu hợp đồng">{message}</Notice>}
    <EmployeeContractForm employeeId={data.id} expectedVersion={data.contractVersion} busy={busy} locked={locked} onSave={save} />
  </Dialog>;
}

function ProfileContent({ data, api, payrollApi, refresh }) {
  const [contractOpen, setContractOpen] = useState(false);
  const [tab, setTab] = useState('overview'), [decision, setDecision] = useState(null), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null), operation = useRef(null);
  const areaName = code => data.areaCatalog?.find(a => a.code === code)?.label ?? code;
  const areas = values => values?.length ? values.map(areaName).join(', ') : 'Chưa đăng ký';
  async function submit(event) {
    event.preventDefault();
    if (busy || reason.trim().length < 3) return;
    if (!operation.current) operation.current = { applicationId: data.application.id,
      action: decision, expectedVersion: data.statusVersion, reason: reason.trim(), idempotencyKey: globalThis.crypto.randomUUID() };
    setBusy(true); setMessage(null);
    try {
      await api.changeStatus(operation.current);
      setDecision(null); operation.current = null; refresh();
    } catch (error) {
      setMessage(error?.code === 'VERSION_CONFLICT' ? 'Trạng thái đã thay đổi. Đóng và tải lại hồ sơ trước khi thao tác.'
        : error?.status === 403 ? 'Phiên hiện tại không có quyền thực hiện thao tác.'
          : 'Chưa xác nhận được kết quả. Thử lại để kiểm tra cùng thao tác hoặc đóng và tải lại hồ sơ.');
    } finally { setBusy(false); }
  }
  return <>
    <div className="sitter-profile-toolbar"><div><SitterStatus value={data.status} /> <span className="sitter-source">{data.demo ? 'Hồ sơ Demo' : 'Hồ sơ thực'}</span>
      <p className="workspace-updated">Tài khoản: {sitterLabel(data.accountState)} · Cập nhật {managementDate(data.asOf)}</p></div>
      <div className="workspace-heading-actions"><Link to={'/staff/dispatch?sitterId=' + data.id}><CalendarDays size={16} />Điều phối ca</Link>
        {data.profileState === 'SUBMITTED' && <Link to={'/staff/sitter-profiles?userId=' + data.id}><FileCheck2 size={16} />Duyệt hồ sơ công khai</Link>}
        {data.permissions.reviewApplication && <Link to={'/admin/sitter-applications/' + data.application.id}><ExternalLink size={16} />Hồ sơ ứng tuyển</Link>}
        {data.permissions.manageStatus && ['ACTIVE', 'SUSPENDED'].includes(data.status) && <Button variant={data.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={() => {
          setDecision(data.status === 'ACTIVE' ? 'SUSPEND' : 'REINSTATE'); setReason(''); setMessage(null); operation.current = null;
        }}>{data.status === 'ACTIVE' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}{data.status === 'ACTIVE' ? 'Tạm ngưng' : 'Khôi phục'}</Button>}
      </div>
    </div>
    <div className="workspace-tabs" role="group" aria-label="Nội dung hồ sơ">{[
      ['overview', 'Tổng quan'], ['capability', 'Năng lực và hợp đồng'], ['schedule', 'Lịch làm việc'], ['activity', 'Công việc'],
      ...(data.permissions.reviewApplication ? [['audit', 'Lịch sử quản lý']] : [])
    ].map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === 'overview' && <div className="sitter-profile-sections"><section><h2>Hồ sơ công khai</h2>
      <p>{data.rating?.available ? data.rating.count ? `${Number(data.rating.average).toFixed(1)} / 5 · ${data.rating.count} đánh giá đã công khai` : 'Chưa có đánh giá đã công khai' : 'Nguồn đánh giá chưa sẵn sàng'}</p>
      {data.profile ? <><p className="sitter-profile-bio">{data.profile.bio}</p><dl className="sitter-profile-facts"><div><dt>Duyệt hồ sơ</dt><dd><SitterStatus value={data.profile.state} /></dd></div>
        <div><dt>Khu vực giới thiệu</dt><dd>{areas(data.profile.areas)}</dd></div><div><dt>Cập nhật hồ sơ</dt><dd>{managementDate(data.profile.updatedAt)}</dd></div></dl></> : <p>Chưa có hồ sơ công khai.</p>}</section>
      <section><h2>Thông tin ứng tuyển</h2>{data.application ? <dl className="sitter-profile-facts"><div><dt>Kinh nghiệm</dt><dd className="sitter-profile-bio">{data.application.experience}</dd></div>
        <div><dt>Đủ 18 tuổi khi thẩm định</dt><dd>{data.application.ageEligible ? 'Đạt' : 'Chưa xác nhận'}</dd></div>
        <div><dt>Nguyện vọng làm việc</dt><dd>{sitterLabel(data.application.employmentType)}</dd></div>
        <div><dt>Dịch vụ mong muốn</dt><dd>{data.application.requestedServices.map(sitterLabel).join(', ')}</dd></div>
        <div><dt>Khu vực mong muốn</dt><dd>{areas(data.application.workAreas)}</dd></div><div><dt>Ngày nộp hồ sơ</dt><dd>{managementDate(data.application.submittedAt)}</dd></div></dl> : <p>Chưa có hồ sơ ứng tuyển liên kết.</p>}</section>
    </div>}
    {tab === 'capability' && <div className="sitter-profile-sections"><section><h2>Năng lực nhận việc</h2>{data.capabilities ? <dl className="sitter-profile-facts">
      <div><dt>Trạng thái năng lực</dt><dd>{data.capabilities.active ? 'Đã bật' : 'Chưa bật'}</dd></div><div><dt>Dịch vụ</dt><dd>{data.capabilities.services.map(s => sitterLabel(s.code ?? s.id)).join(', ') || 'Chưa thiết lập'}</dd></div>
      <div><dt>Loài</dt><dd>{data.capabilities.species.map(sitterLabel).join(', ')}</dd></div><div><dt>Số thú cưng tối đa / buổi</dt><dd>{data.capabilities.maxPets}</dd></div>
      <div><dt>Cân nặng tối đa / thú cưng</dt><dd>{data.capabilities.maxWeightKg} kg</dd></div><div><dt>Khu vực nhận việc</dt><dd>{areas(data.capabilities.areas)}</dd></div>
      <div><dt>Đặc điểm được hỗ trợ</dt><dd>{data.capabilities.allowedTraits.join(', ') || 'Chưa thiết lập'}</dd></div></dl> : <p>Chưa có năng lực nhận việc.</p>}</section>
      <section><h2>Hợp đồng hiệu lực</h2><p><SitterStatus value={data.employmentType} /></p>{data.contracts.map((c, i) => <dl key={i} className="sitter-profile-facts">
        <div><dt>Hình thức làm việc</dt><dd>{sitterLabel(c.employmentType)}</dd></div><div><dt>Thời lượng mỗi tuần</dt><dd>{c.weeklyMinutes / 60} giờ</dd></div>
        <div><dt>Hiệu lực từ</dt><dd>{managementDate(c.effectiveAt)}</dd></div><div><dt>Kết thúc</dt><dd>{c.endsAt ? managementDate(c.endsAt) : 'Chưa có ngày kết thúc'}</dd></div><div><dt>Phiên bản</dt><dd>{c.version}</dd></div>
      </dl>)}{!data.contracts.length && <p>Chưa có hợp đồng hiệu lực.</p>}
        {data.permissions.manageContract && payrollApi && <Button variant="secondary" onClick={() => setContractOpen(true)}><FileCheck2 size={16} />Xác minh hợp đồng đã ký</Button>}
        </section></div>}
    {tab === 'schedule' && <section><h2>Lịch làm việc đã đăng ký</h2>{data.availability ? <>
      <dl className="sitter-profile-facts"><div><dt>Trạng thái lịch</dt><dd><SitterStatus value={data.availability.state} /></dd></div>
        <div><dt>Múi giờ</dt><dd>Giờ Việt Nam</dd></div><div><dt>Hiệu lực từ</dt><dd>{data.availability.effectiveFrom ?? 'Chưa có'}</dd></div>
        <div><dt>Khu vực đăng ký</dt><dd>{areas(data.availability.areas)}</dd></div><div><dt>Ngày nghỉ đã đăng ký</dt><dd>{data.availability.dayOffDates.join(', ') || 'Chưa có'}</dd></div></dl>
      <div className="workspace-table-wrap"><table className="workspace-table sitter-schedule-table"><thead><tr><th>Ngày</th><th>Bắt đầu</th><th>Kết thúc</th></tr></thead>
        <tbody>{data.availability.workingWindows.length ? data.availability.workingWindows.map((w, i) => <tr key={i}><td>{weekdayLabel(w.weekday)}</td><td>{w.startLocalTime}</td><td>{w.endLocalTime}</td></tr>)
          : <tr><td colSpan={3}>Chưa đăng ký ca làm việc.</td></tr>}</tbody></table></div></> : <p>Chưa đăng ký lịch làm việc.</p>}</section>}
    {tab === 'activity' && <WorkHistory api={api} userId={data.id} />}
    {tab === 'audit' && <section><h2>Lịch sử quản lý gần nhất</h2><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Thời điểm</th><th>Thao tác</th><th>Phiên bản kết quả</th></tr></thead>
      <tbody>{data.audit.length ? data.audit.map(a => <tr key={a.id}><td>{managementDate(a.at)}</td><td>{sitterLabel(a.action)}</td><td>{a.version ?? 'Chưa có'}</td></tr>)
        : <tr><td colSpan={3}>Chưa có thao tác quản lý.</td></tr>}</tbody></table></div></section>}
    {contractOpen && <ContractDialog data={data} api={payrollApi} onClose={() => setContractOpen(false)} onSaved={() => { setContractOpen(false); refresh(); }} />}
    <Dialog open={Boolean(decision)} dismissible={!busy} className="workspace-dialog" intent={decision === 'SUSPEND' ? 'destructive' : 'default'}
      title={decision === 'SUSPEND' ? 'Tạm ngưng người chăm sóc' : 'Khôi phục người chăm sóc'} onClose={() => { if (!busy) { setDecision(null); operation.current = null; } }}
      footer={<Button type="submit" form="sitter-status-command" loading={busy}>{operation.current ? 'Thử lại cùng thao tác' : 'Xác nhận'}</Button>}>
      <form className="workspace-form" id="sitter-status-command" onSubmit={submit}><p>{data.displayName}</p>
        <label>Lý do<textarea required minLength={3} maxLength={1000} rows={4} value={reason} disabled={Boolean(operation.current) || busy} onChange={e => setReason(e.target.value)} /></label>
        {message && <Notice state="error" title="Chưa hoàn tất">{message}</Notice>}</form>
    </Dialog>
  </>;
}

export function SitterManagementDetailPage({ api, payrollApi }) {
  const { userId } = useParams(), location = useLocation();
  const load = useCallback(options => api.get(userId, options), [api, userId]);
  const resource = useApiResource(load), data = resource.data;
  return <div className="workspace-page sitter-management"><Link className="sitter-back" to={location.pathname.startsWith('/admin') ? '/admin/sitters' : '/staff/sitters'}><ArrowLeft size={16} />Người chăm sóc</Link>
    <header className="workspace-page-heading"><div><h1>{data?.displayName ?? 'Hồ sơ người chăm sóc'}</h1>{data && <p>Mã hồ sơ: {data.id}</p>}</div>
      <button type="button" className="workspace-icon-button" aria-label="Tải lại hồ sơ" title="Tải lại hồ sơ" onClick={resource.retry}><RefreshCw size={17} /></button></header>
    <ManagementState resource={resource} title="hồ sơ" />
    {resource.status === 'success' && <ProfileContent key={data.id + ':' + data.asOf} data={data} api={api} payrollApi={payrollApi} refresh={resource.retry} />}
  </div>;
}
