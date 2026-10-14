import { useCallback, useMemo, useState } from 'react';
import { BrandLogo, Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import './admin-services.css';

const SPECIES = [{ value: 'DOG', label: 'Chó' }, { value: 'CAT', label: 'Mèo' }];
const STATES = [
  { value: 'DRAFT', label: 'Bản nháp' }, { value: 'ACTIVE', label: 'Đang cung cấp' },
  { value: 'INACTIVE', label: 'Tạm ngừng' }, { value: 'ARCHIVED', label: 'Lưu trữ' }
];
const localDateTime = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const toUtc = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
};
const blankService = () => ({ code: '', name: '', description: '', scope: '', species: ['DOG', 'CAT'],
  state: 'DRAFT', effectiveAt: localDateTime(), reason: '' });
const blankPolicy = () => ({ title: '', body: '', effectiveAt: localDateTime(), reason: '' });
const getErrorMessage = error => {
  if (error?.status === 401) return 'Phiên làm việc đã hết hạn. Đăng nhập lại rồi thử tiếp.';
  if (error?.status === 403) return 'Tài khoản hiện tại không có quyền thay đổi dịch vụ.';
  if (error?.status === 409) return 'Dữ liệu vừa được cập nhật ở nơi khác. Tải lại trước khi tiếp tục.';
  if (error?.status === 422) return 'Kiểm tra lại các trường và thời điểm hiệu lực.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') return 'Chưa nhận được xác nhận. Tải lại trước khi thử tiếp.';
  return 'Không thể hoàn tất yêu cầu. Hãy tải lại và thử lại sau.';
};

export function AdminServicesPage({ apiRequest: suppliedRequest }) {
  const session = useSession();
  const isAdmin = session.user?.roles?.includes('ADMIN');
  const canView = session.user?.roles?.some(role => role === 'STAFF' || role === 'ADMIN');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(blankService);
  const [policyForm, setPolicyForm] = useState(blankPolicy);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const apiRequest = useMemo(() => suppliedRequest ?? createApiClient({
    getCsrfToken: session.getCsrfToken, onUnauthorized: session.invalidate
  }), [suppliedRequest, session.getCsrfToken, session.invalidate]);
  const load = useCallback(options => apiRequest('/services/admin', options), [apiRequest]);
  const resource = useApiResource(load);
  const services = Array.isArray(resource.data) ? resource.data : [];
  const selected = services.find(service => service.id === selectedId) ?? services[0] ?? null;

  const choose = service => {
    setSelectedId(service.id);
    setForm({ name: service.name, description: service.description, scope: service.scope,
      species: [...service.species], state: service.state, effectiveAt: localDateTime(), reason: '' });
    setPolicyForm(blankPolicy());
    setEditing(false);
    setFeedback(null);
  };

  const saveService = async event => {
    event.preventDefault();
    if (!isAdmin || pending) return;
    setPending(true); setFeedback(null);
    const body = { ...form, effectiveAt: toUtc(form.effectiveAt), reason: form.reason.trim() };
    const path = editing ? '/services/admin/' + selected.id : '/services/admin';
    if (editing) body.expectedVersion = selected.version;
    try {
      const response = await apiRequest(path, { method: editing ? 'PUT' : 'POST', body });
      if (response.pending) setFeedback({ state: 'pending', text: 'Yêu cầu đang xử lý. Tải lại để xác nhận.' });
      else {
        if (response.data?.id) setSelectedId(response.data.id);
        setEditing(false);
        setFeedback({ state: 'success', text: 'Máy chủ đã ghi nhận phiên bản dịch vụ mới.' });
        resource.retry();
      }
    } catch (error) {
      setFeedback({ state: error.status === 403 ? 'forbidden' : 'error', text: getErrorMessage(error) });
    } finally { setPending(false); }
  };

  const savePolicy = async event => {
    event.preventDefault();
    if (!isAdmin || !selected || pending) return;
    setPending(true); setFeedback(null);
    const body = {
      expectedVersion: selected.latestPolicyVersion ?? selected.policy?.version ?? 0,
      state: 'PUBLISHED', title: policyForm.title.trim(), body: policyForm.body.trim(),
      effectiveAt: toUtc(policyForm.effectiveAt), reason: policyForm.reason.trim()
    };
    try {
      const response = await apiRequest('/services/admin/' + selected.id + '/policies', { method: 'POST', body });
      if (response.pending) setFeedback({ state: 'pending', text: 'Yêu cầu đang xử lý. Tải lại để xác nhận.' });
      else {
        setPolicyForm(blankPolicy());
        setFeedback({ state: 'success', text: 'Máy chủ đã ghi nhận phiên bản chính sách mới.' });
        resource.retry();
      }
    } catch (error) {
      setFeedback({ state: error.status === 403 ? 'forbidden' : 'error', text: getErrorMessage(error) });
    } finally { setPending(false); }
  };

  if (session.status === 'loading' || session.status === 'pending') {
    return <main className="admin-services"><Notice state="loading" title="Đang kiểm tra phiên">Đang xác minh quyền truy cập.</Notice></main>;
  }
  if (!canView) {
    return <main className="admin-services"><Notice state="forbidden" title="Không có quyền xem dịch vụ">
      Chỉ nhân viên được phân quyền và quản trị viên mới xem được danh mục.
    </Notice></main>;
  }

  return <main className="admin-services">
    <a className="admin-services-skip" href="#service-content">Bỏ qua đến nội dung</a>
    <header className="admin-services-header">
      <div><BrandLogo className="admin-services-logo" /><p className="admin-services-eyebrow">QUẢN TRỊ DỊCH VỤ</p>
        <h1>Quản lý dịch vụ</h1><p>Mô tả dịch vụ, phạm vi chăm sóc và chính sách đang áp dụng.</p></div>
      <span className="admin-services-provisional">Đề xuất · Figma chưa đối chiếu</span>
    </header>
    <div className="admin-services-toolbar">
      <p>Thay đổi tạo phiên bản theo thời điểm hiệu lực. Booking đã tạo giữ snapshot cũ.</p>
      <Button variant="secondary" onClick={resource.retry} disabled={pending}>Tải lại</Button>
    </div>
    {feedback && <Notice state={feedback.state} title={feedback.state === 'success' ? 'Đã lưu' : 'Chưa hoàn tất'}>{feedback.text}</Notice>}
    <section className="admin-services-grid" id="service-content" aria-label="Danh mục dịch vụ">
      <aside className="admin-services-list" aria-label="Dịch vụ">
        <div className="admin-services-list-heading"><div><p className="admin-services-eyebrow">DANH MỤC</p><h2>Dịch vụ</h2></div>
          {isAdmin && <Button onClick={() => { setSelectedId(''); setForm(blankService()); setEditing(false); setFeedback(null); }}>Thêm dịch vụ</Button>}
        </div>
        {resource.status === 'loading' && <Notice state="loading" title="Đang tải dịch vụ">Đang lấy dữ liệu mới nhất.</Notice>}
        {resource.status === 'pending' && <Notice state="pending" title="Danh mục đang chờ">Máy chủ chưa xác nhận dữ liệu cuối cùng.</Notice>}
        {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem">Yêu cầu này không được phép.</Notice>}
        {resource.status === 'error' && <Notice state="error" title="Không tải được dịch vụ"
          action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Tải lại sau khi kết nối được khôi phục.</Notice>}
        {resource.status === 'empty' && <Notice state="empty" title="Chưa có dịch vụ">
          {isAdmin ? 'Thêm dịch vụ đầu tiên để bắt đầu cấu hình danh mục.' : 'Chưa có thông tin dịch vụ để xử lý.'}
        </Notice>}
        {services.length > 0 && <ul className="admin-services-items">{services.map(service => <li key={service.id}>
          <button type="button" className="admin-service-choice" aria-pressed={selected?.id === service.id} onClick={() => choose(service)}>
            <span className="admin-service-choice-main"><strong>{service.name}</strong><small>{service.code}</small></span>
            <span className={'admin-service-state admin-service-state--' + service.state.toLowerCase()}>
              {STATES.find(item => item.value === service.state)?.label ?? service.state}
            </span>
          </button>
        </li>)}</ul>}
      </aside>
      <section className="admin-service-detail" aria-label={selected ? 'Chi tiết ' + selected.name : 'Dịch vụ mới'}>
        <div className="admin-service-detail-heading">
          <div><p className="admin-services-eyebrow">{selected ? 'PHIÊN BẢN ' + selected.version : 'DỊCH VỤ MỚI'}</p>
            <h2>{editing ? 'Tạo phiên bản dịch vụ' : selected?.name ?? (isAdmin ? 'Tạo dịch vụ' : 'Chọn dịch vụ')}</h2></div>
          {selected && isAdmin && !editing && <Button variant="secondary" onClick={() => {
            setForm({ name: selected.name, description: selected.description, scope: selected.scope, species: [...selected.species],
              state: selected.state, effectiveAt: localDateTime(), reason: '' });
            setEditing(true); setFeedback(null);
          }}>Tạo phiên bản mới</Button>}
        </div>
        {selected && !editing && <div className="admin-service-summary">
          <dl>
            <div><dt>Trạng thái</dt><dd>{STATES.find(item => item.value === selected.state)?.label ?? selected.state}</dd></div>
            <div><dt>Loài áp dụng</dt><dd>{selected.species.map(value => SPECIES.find(item => item.value === value)?.label ?? value).join(', ')}</dd></div>
            <div><dt>Phạm vi chăm sóc</dt><dd className="admin-service-preserve-lines">{selected.scope}</dd></div>
            <div><dt>Mô tả</dt><dd className="admin-service-preserve-lines">{selected.description || 'Chưa có mô tả.'}</dd></div>
            <div><dt>Hiệu lực</dt><dd>{new Date(selected.effectiveAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</dd></div>
            <div><dt>Chính sách</dt><dd>{selected.policy?.state === 'PUBLISHED' ? selected.policy.title : 'Chưa có chính sách được xuất bản.'}</dd></div>
          </dl>
          {selected.policy?.state === 'PUBLISHED' && <article className="admin-service-policy">
            <h3>{selected.policy.title}</h3><p className="admin-service-preserve-lines">{selected.policy.body}</p>
            <small>Phiên bản {selected.policy.version} · hiệu lực {new Date(selected.policy.effectiveAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small>
          </article>}
        </div>}
        {isAdmin && (editing || !selected) && <form className="admin-service-form" onSubmit={saveService}>
          {!editing && <Input label="Mã dịch vụ" required minLength={2} maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} hint="Chữ thường, số và dấu gạch nối." />}
          <Input label="Tên dịch vụ" required minLength={2} maxLength={120} value={form.name}
            onChange={event => setForm({ ...form, name: event.target.value })} />
          <label className="admin-service-field"><span>Mô tả</span><textarea value={form.description} maxLength={2000} rows="3"
            onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label className="admin-service-field"><span>Phạm vi chăm sóc</span><textarea required minLength={3} maxLength={2000}
            value={form.scope} rows="4" onChange={event => setForm({ ...form, scope: event.target.value })} /></label>
          <fieldset className="admin-service-species"><legend>Loài thú cưng áp dụng</legend>
            {SPECIES.map(item => <label key={item.value}><input type="checkbox" checked={form.species.includes(item.value)}
              onChange={event => setForm({ ...form, species: event.target.checked
                ? [...form.species, item.value] : form.species.filter(value => value !== item.value) })} /><span>{item.label}</span></label>)}
          </fieldset>
          <Select label="Trạng thái" value={form.state} onChange={event => setForm({ ...form, state: event.target.value })}>
            {STATES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Input label="Thời điểm hiệu lực" type="datetime-local" required value={form.effectiveAt}
            onChange={event => setForm({ ...form, effectiveAt: event.target.value })} />
          <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={form.reason}
            onChange={event => setForm({ ...form, reason: event.target.value })} />
          <div className="admin-service-actions"><Button type="submit" loading={pending} loadingLabel="Đang lưu…">
            {editing ? 'Lưu phiên bản' : 'Tạo dịch vụ'}
          </Button>{editing && <Button variant="ghost" onClick={() => { setEditing(false); setFeedback(null); }}>Hủy</Button>}</div>
        </form>}
        {selected && isAdmin && !editing && <form className="admin-service-form admin-policy-form" onSubmit={savePolicy}>
          <div><p className="admin-services-eyebrow">CHÍNH SÁCH</p><h3>Xuất bản phiên bản chính sách</h3></div>
          <Input label="Tiêu đề" required minLength={2} maxLength={120} value={policyForm.title}
            onChange={event => setPolicyForm({ ...policyForm, title: event.target.value })} />
          <label className="admin-service-field"><span>Nội dung chính sách</span><textarea required minLength={3} maxLength={10000}
            rows="5" value={policyForm.body} onChange={event => setPolicyForm({ ...policyForm, body: event.target.value })} /></label>
          <Input label="Thời điểm hiệu lực" type="datetime-local" required value={policyForm.effectiveAt}
            onChange={event => setPolicyForm({ ...policyForm, effectiveAt: event.target.value })} />
          <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={policyForm.reason}
            onChange={event => setPolicyForm({ ...policyForm, reason: event.target.value })} />
          <p className="admin-service-policy-note">Chỉ nhập nội dung đã được duyệt. Booking cũ giữ snapshot chính sách đã chấp thuận.</p>
          <Button type="submit" loading={pending} loadingLabel="Đang xuất bản…">Xuất bản chính sách</Button>
        </form>}
      </section>
    </section>
  </main>;
}
