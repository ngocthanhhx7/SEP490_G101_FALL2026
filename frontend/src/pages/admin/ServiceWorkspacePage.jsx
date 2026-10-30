import { useCallback, useMemo, useState } from 'react';
import { Plus, RefreshCw, Pencil, Eye, Archive, CircleDollarSign, Percent, FileText } from 'lucide-react';
import { RowActionMenu } from '../../components/common/RowActionMenu.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { Button, Dialog, Input, Notice, Select } from '../../components/ui/index.js';
import { WorkspaceAnalytics } from '../../components/common/WorkspaceAnalytics.jsx';
import '../../styles/workspaces.css';

const states = { ACTIVE: 'Đang cung cấp', INACTIVE: 'Tạm ngừng', DRAFT: 'Bản nháp', ARCHIVED: 'Đã lưu trữ' };
const localTime = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const money = value => Number.isSafeInteger(value) ? value.toLocaleString('vi-VN') + ' ₫' : 'Chưa có giá';
const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const blank = () => ({ code: '', name: '', description: '', scope: '', species: ['DOG', 'CAT'], state: 'DRAFT', effectiveAt: localTime(), reason: '' });
function feedbackText(error) {
  if (error.status === 409) return 'Dữ liệu đã thay đổi hoặc chưa có chính sách được duyệt. Tải lại để kiểm tra.';
  if (error.status === 422) return 'Kiểm tra các trường bắt buộc, số nguyên và thời điểm hiệu lực.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  return 'Chưa nhận được xác nhận. Tải lại để kiểm tra trước khi thử tiếp.';
}

function ServiceEditor({ service, mode, request, onSaved, onClose }) {
  const [form, setForm] = useState(() => service ? { name: service.name, description: service.description, scope: service.scope,
    species: [...service.species], state: mode === 'archive' ? 'ARCHIVED' : service.state, effectiveAt: localTime(), reason: '' } : blank());
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const field = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const body = { ...form, effectiveAt: new Date(form.effectiveAt).toISOString(), ...(service ? { expectedVersion: service.version } : {}) };
      const result = await request('/services/admin' + (service ? '/' + service.id : ''), { method: service ? 'PUT' : 'POST', body });
      if (result.pending) setError('Yêu cầu đang xử lý. Tải lại để xác nhận.'); else onSaved();
    } catch (failure) { setError(feedbackText(failure)); } finally { setBusy(false); }
  }
  return <form className="workspace-form" onSubmit={save}>
    {mode === 'archive' ? <p>Dịch vụ <strong>{service.name}</strong> sẽ ngừng nhận booking mới. Lịch sử và các booking hiện có được giữ lại.</p> : <>
      {!service && <Input label="Mã dịch vụ" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={48} value={form.code} onChange={e => field('code', e.target.value)} />}
      <Input label="Tên dịch vụ" required minLength={2} maxLength={120} value={form.name} onChange={e => field('name', e.target.value)} />
      <label>Mô tả<textarea rows={3} maxLength={2000} value={form.description} onChange={e => field('description', e.target.value)} /></label>
      <label>Phạm vi chăm sóc<textarea required minLength={3} rows={3} maxLength={2000} value={form.scope} onChange={e => field('scope', e.target.value)} /></label>
      <fieldset><legend>Loài áp dụng</legend>{[['DOG', 'Chó'], ['CAT', 'Mèo']].map(([value, label]) => <label key={value}><input type="checkbox" checked={form.species.includes(value)}
        onChange={e => field('species', e.target.checked ? [...form.species, value] : form.species.filter(item => item !== value))} />{label}</label>)}</fieldset>
      <Select label="Trạng thái" value={form.state} onChange={e => field('state', e.target.value)}>{Object.entries(states).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</Select>
    </>}
    <Input label="Thời điểm hiệu lực" type="datetime-local" required value={form.effectiveAt} onChange={e => field('effectiveAt', e.target.value)} />
    <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={form.reason} onChange={e => field('reason', e.target.value)} />
    {error && <Notice state="error" title="Chưa lưu thay đổi">{error}</Notice>}
    <div className="workspace-heading-actions"><Button type="submit" loading={busy} variant={mode === 'archive' ? 'danger' : 'primary'} disabled={!form.species.length}>{mode === 'archive' ? 'Xác nhận lưu trữ' : service ? 'Lưu thay đổi' : 'Tạo dịch vụ'}</Button><Button variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button></div>
  </form>;
}

function VersionEditor({ service, mode, request, onSaved }) {
  const path = mode === 'combo' ? '/pricing/services/' + service.id + '/combo' : '/service-prices/admin/' + service.id;
  const load = useCallback(options => request(path, options), [request, path]);
  const resource = useApiResource(load);
  const [amount, setAmount] = useState(''), [unit, setUnit] = useState(service.price?.unitLabel ?? '');
  const [perVisit, setPerVisit] = useState(''), [maximum, setMaximum] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localTime), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const rows = mode === 'combo' ? resource.data?.policies ?? [] : resource.data?.prices ?? [];
  const latest = rows.find(row => row.version === resource.data?.latestVersion);
  async function save(event) {
    event.preventDefault(); if (busy || resource.status !== 'success') return;
    const toBps = value => /^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN;
    const comboPerVisitBps = perVisit === '' ? latest?.comboPerVisitBps : toBps(perVisit);
    const comboMaxBps = maximum === '' ? latest?.comboMaxBps : toBps(maximum);
    if (mode === 'combo' ? !Number.isSafeInteger(comboPerVisitBps) || !Number.isSafeInteger(comboMaxBps)
      : !/^(0|[1-9]\d*)$/.test(amount) || !Number.isSafeInteger(Number(amount))) { setError('Nhập số hợp lệ. Giá dùng VND nguyên, tỷ lệ tối đa 2 chữ số thập phân.'); return; }
    setBusy(true); setError('');
    try {
      const body = { expectedVersion: resource.data.latestVersion, effectiveAt: new Date(effectiveAt).toISOString(), reason,
        ...(mode === 'combo' ? { comboPerVisitBps, comboMaxBps } : { amountVnd: Number(amount), unitLabel: unit }) };
      const result = await request(path, { method: 'POST', body });
      if (result.pending) setError('Đang chờ xác nhận. Tải lại để kiểm tra.'); else onSaved();
    } catch (failure) { setError(feedbackText(failure)); } finally { setBusy(false); }
  }
  return <div className="workspace-form">
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải lịch sử" />}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title="Chưa tải được cấu hình" action={<Button onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'success' && <>
      <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Phiên bản</th><th>{mode === 'combo' ? 'Ưu đãi mỗi lượt / tối đa' : 'Giá / đơn vị'}</th><th>Hiệu lực</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.version}><td>{row.version}</td><td>{mode === 'combo' ? `${row.comboPerVisitBps / 100}% / ${row.comboMaxBps / 100}%` : money(row.amountVnd) + ' / ' + row.unitLabel}</td><td>{date(row.effectiveAt)}</td></tr>)}</tbody></table></div>
      <form className="workspace-form" onSubmit={save}><h3>{mode === 'combo' ? 'Điều chỉnh ưu đãi nhiều buổi' : 'Cập nhật giá'}</h3>
        {mode === 'combo' ? <><Input label="Giảm mỗi lượt (%)" type="number" min="0" max="10" step="0.01" value={perVisit || (perVisit === '0' ? '0' : '')} placeholder={String((latest?.comboPerVisitBps ?? 0) / 100)} onChange={e => setPerVisit(e.target.value)} />
          <Input label="Giảm tối đa (%)" type="number" min="0" max="10" step="0.01" value={maximum} placeholder={String((latest?.comboMaxBps ?? 0) / 100)} onChange={e => setMaximum(e.target.value)} />
          <p>Áp dụng trên tiền dịch vụ trước phụ phí. Booking đã tạo giữ giá và ưu đãi đã xác nhận.</p></>
          : <><Input label="Giá (VND)" required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={amount} onChange={e => setAmount(e.target.value)} />
            <Input label="Đơn vị áp dụng" required minLength={2} maxLength={80} value={unit} onChange={e => setUnit(e.target.value)} /></>}
        <Input label="Thời điểm hiệu lực" type="datetime-local" required value={effectiveAt} onChange={e => setEffectiveAt(e.target.value)} />
        <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        {error && <Notice state="error" title="Chưa lưu thay đổi">{error}</Notice>}
        <Button type="submit" loading={busy} disabled={mode === 'combo' && !latest}>Lưu phiên bản mới</Button>
      </form>
    </>}
  </div>;
}

function PolicyEditor({ service, request, onSaved }) {
  const [title, setTitle] = useState(service.policy?.title ?? ''), [body, setBody] = useState(service.policy?.body ?? '');
  const [effectiveAt, setEffectiveAt] = useState(localTime), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <form className="workspace-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const result = await request('/services/admin/' + service.id + '/policies', { method: 'POST', body: { expectedVersion: service.latestPolicyVersion ?? 0,
        state: 'PUBLISHED', title, body, effectiveAt: new Date(effectiveAt).toISOString(), reason } });
      if (result.pending) setError('Đang chờ xác nhận.'); else onSaved();
    } catch (failure) { setError(feedbackText(failure)); } finally { setBusy(false); }
  }}>
    <Input label="Tiêu đề chính sách" required minLength={2} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
    <label>Nội dung chính sách<textarea required minLength={3} maxLength={10000} rows={6} value={body} onChange={e => setBody(e.target.value)} /></label>
    <Input label="Thời điểm hiệu lực" type="datetime-local" required value={effectiveAt} onChange={e => setEffectiveAt(e.target.value)} />
    <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
    {error && <Notice state="error" title="Chưa lưu thay đổi">{error}</Notice>}
    <Button type="submit" loading={busy}>Xuất bản chính sách</Button>
  </form>;
}

export function ServiceWorkspacePage({ apiRequest }) {
  const session = useSession();
  const request = useMemo(() => apiRequest ?? createApiClient({ getCsrfToken: session.getCsrfToken, onUnauthorized: session.invalidate }), [apiRequest, session.getCsrfToken, session.invalidate]);
  const load = useCallback(options => request('/services/admin', options), [request]);
  const resource = useApiResource(load);
  const [search, setSearch] = useState(''), [state, setState] = useState(''), [species, setSpecies] = useState('');
  const [page, setPage] = useState(1), [size, setSize] = useState(10), [sort, setSort] = useState('name');
  const [dialog, setDialog] = useState(null), [success, setSuccess] = useState(false);
  const [analyticsRevision, setAnalyticsRevision] = useState(0);
  const services = Array.isArray(resource.data) ? resource.data : [];
  const filtered = services.filter(row => (!state || row.state === state) && (!species || row.species.includes(species))
    && `${row.name} ${row.code}`.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN')))
    .sort((a, b) => sort === 'price' ? (a.price?.amountVnd ?? Infinity) - (b.price?.amountVnd ?? Infinity) : a.name.localeCompare(b.name, 'vi'));
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages);
  const open = (mode, service = null) => { setDialog({ mode, service }); setSuccess(false); };
  const close = () => setDialog(null), saved = () => { close(); setSuccess(true); setAnalyticsRevision(value => value + 1); resource.retry(); };
  const titles = { create: 'Tạo dịch vụ', edit: 'Chỉnh sửa dịch vụ', archive: 'Lưu trữ dịch vụ', detail: 'Chi tiết dịch vụ', price: 'Giá dịch vụ', combo: 'Ưu đãi nhiều buổi', policy: 'Chính sách dịch vụ' };
  return <div className="workspace-page">
    <header className="workspace-page-heading"><div><h1>Dịch vụ và giá</h1><p>Danh mục chăm sóc, giá áp dụng và ưu đãi nhiều buổi.</p></div>
      <div className="workspace-heading-actions"><Button variant="secondary" onClick={resource.retry}><RefreshCw size={17} />Tải lại</Button><Button onClick={() => open('create')}><Plus size={18} />Tạo dịch vụ</Button></div></header>
    <WorkspaceAnalytics key={analyticsRevision} kind="services" />
    {success && <Notice state="success" title="Đã lưu thay đổi">Máy chủ đã ghi nhận phiên bản mới.</Notice>}
    <section aria-label="Danh mục dịch vụ"><div className="workspace-table-toolbar">
      <Input type="search" label="Tìm dịch vụ" placeholder="Tên hoặc mã dịch vụ" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <Select label="Trạng thái" value={state} onChange={e => { setState(e.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Select label="Loài áp dụng" value={species} onChange={e => { setSpecies(e.target.value); setPage(1); }}><option value="">Tất cả loài</option><option value="DOG">Chó</option><option value="CAT">Mèo</option></Select>
      <Select label="Sắp xếp" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="name">Tên A–Z</option><option value="price">Giá tăng dần</option></Select>
    </div>
      {['loading', 'error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title={resource.status === 'loading' ? 'Đang tải dịch vụ' : 'Chưa tải được danh mục'} action={resource.status === 'error' ? <Button onClick={resource.retry}>Thử lại</Button> : undefined} />}
      {['success', 'empty'].includes(resource.status) && <>
        <div className="workspace-table-wrap"><table className="workspace-table workspace-table--services"><thead><tr><th>Dịch vụ</th><th>Loài áp dụng</th><th>Giá hiệu lực</th><th>Trạng thái</th><th>Phiên bản / hiệu lực</th><th>Thao tác</th></tr></thead>
          <tbody>{filtered.slice((current - 1) * size, current * size).map(row => <tr key={row.id}>
            <td><strong>{row.name}</strong><small>{row.code}</small></td><td>{row.species.map(value => value === 'DOG' ? 'Chó' : 'Mèo').join(', ')}</td>
            <td><strong>{money(row.price?.amountVnd)}</strong><small>{row.price?.unitLabel}</small></td><td><span className={'workspace-status workspace-status--' + row.state}>{states[row.state]}</span></td>
            <td>v{row.version}<small>{date(row.effectiveAt)}</small></td><td><RowActionMenu label={'Thao tác ' + row.name}
              actions={[[ 'detail', Eye, 'Xem chi tiết'], ['edit', Pencil, 'Chỉnh sửa'], ['price', CircleDollarSign, 'Cập nhật giá'], ['combo', Percent, 'Ưu đãi nhiều buổi'], ['policy', FileText, 'Chính sách'], ['archive', Archive, 'Lưu trữ']].map(([mode, icon, label]) =>
                ({ label, icon, disabled: mode === 'archive' && row.state === 'ARCHIVED', onClick: () => open(mode, row) }))} /></td></tr>)}
            {!filtered.length && <tr><td colSpan={6} className="workspace-empty">Không có dịch vụ phù hợp</td></tr>}
          </tbody></table></div>
        <div className="workspace-pagination"><span>{filtered.length} dịch vụ · Trang {current} / {pages}</span><div><Select label="Số dòng" value={size} onChange={e => { setSize(Number(e.target.value)); setPage(1); }}>{[10, 20, 50].map(value => <option key={value} value={value}>{value}</option>)}</Select>
          <Button variant="secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Trước</Button><Button variant="secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Tiếp theo</Button></div></div>
      </>}
    </section>
    <Dialog open={Boolean(dialog)} onClose={close} title={titles[dialog?.mode] ?? 'Dịch vụ'} className="workspace-dialog" intent={dialog?.mode === 'archive' ? 'destructive' : 'default'}>
      {dialog && <div key={dialog.mode + (dialog.service?.id ?? 'new')}>
        {['create', 'edit', 'archive'].includes(dialog.mode) && <ServiceEditor service={dialog.service} mode={dialog.mode} request={request} onSaved={saved} onClose={close} />}
        {['price', 'combo'].includes(dialog.mode) && <VersionEditor service={dialog.service} mode={dialog.mode} request={request} onSaved={saved} />}
        {dialog.mode === 'policy' && <PolicyEditor service={dialog.service} request={request} onSaved={saved} />}
        {dialog.mode === 'detail' && <div className="workspace-form"><h3>{dialog.service.name}</h3><p>{dialog.service.description}</p><h4>Phạm vi chăm sóc</h4><p>{dialog.service.scope}</p>
          <h4>{dialog.service.policy?.title ?? 'Chưa xuất bản chính sách'}</h4><p>{dialog.service.policy?.body}</p><p>Giá hiệu lực: {money(dialog.service.price?.amountVnd)}</p></div>}
      </div>}
    </Dialog>
  </div>;
}
