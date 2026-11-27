import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandLogo, Button, Input, Notice, Select, Toast } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import './admin-system-settings.css';

const localDateTime = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const errorMessage = error => {
  if (error?.status === 401) return 'Phiên làm việc đã hết hạn. Đăng nhập lại rồi thử tiếp.';
  if (error?.status === 403) return 'Chỉ quản trị viên được thay đổi cấu hình.';
  if (error?.status === 409) return 'Cấu hình vừa được thay đổi ở nơi khác. Tải lại trước khi tiếp tục.';
  if (error?.status === 422) return 'Kiểm tra lại trạng thái, thời điểm hiệu lực và lý do.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') return 'Chưa nhận được xác nhận. Tải lại để kiểm tra trạng thái.';
  return 'Không thể hoàn tất yêu cầu. Hãy tải lại và thử lại sau.';
};

function PickupSettings({ apiRequest }) {
  const load = useCallback(async options => {
    const [current, history] = await Promise.all([
      apiRequest('/system-settings/pickup', options), apiRequest('/system-settings/pickup/history', options)
    ]);
    return { data: { current: current.data, versions: history.data?.versions ?? [] }, pending: current.pending || history.pending };
  }, [apiRequest]);
  const resource = useApiResource(load);
  return <section className="admin-settings-card admin-settings-history" aria-label="Đón thú">
    <h2>Đón thú</h2>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải cài đặt" />}
    {resource.status === 'error' && <Notice state="error" title="Không tải được cài đặt đón thú" action={<Button onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'success' && <PickupSettingsForm key={resource.data.versions[0]?.version ?? 0} data={resource.data} apiRequest={apiRequest} onSaved={resource.retry} />}
  </section>;
}

function PickupSettingsForm({ data, apiRequest, onSaved }) {
  const [tiers, setTiers] = useState(() => (data.versions[0]?.tiers ?? data.current?.tiers ?? [{ fromKm: 0, toKm: '', feeVnd: '' }]).map(tier => ({ ...tier })));
  const [reason, setReason] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localDateTime);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const maxKm = tiers.at(-1)?.toKm ?? '';
  const change = (index, key, value) => setTiers(old => old.map((tier, i) => i === index ? { ...tier, [key]: value } : tier));
  const valid = tiers.length > 0 && tiers.every((tier, i) =>
    [tier.fromKm, tier.toKm, tier.feeVnd].every(value => String(value).trim() !== '' && Number.isFinite(Number(value))) &&
    Number(tier.fromKm) === (i ? Number(tiers[i - 1].toKm) : 0) &&
    Number(tier.toKm) > Number(tier.fromKm) && Number.isSafeInteger(Number(tier.feeVnd)) && Number(tier.feeVnd) >= 0);
  const save = async event => {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true); setFeedback('');
    try {
      const result = await apiRequest('/system-settings/pickup', { method: 'POST', body: {
        expectedVersion: data.versions[0]?.version ?? 0, effectiveAt: new Date(effectiveAt).toISOString(), reason: reason.trim(),
        maxKm: Number(maxKm), tiers: tiers.map(tier => ({ fromKm: Number(tier.fromKm), toKm: Number(tier.toKm), feeVnd: Number(tier.feeVnd) }))
      } });
      if (result.pending) setFeedback('Yêu cầu đang xử lý. Tải lại để xác nhận.');
      else onSaved();
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setPending(false); }
  };
  return <>
    <p>{data.current ? 'Đang áp dụng phiên bản ' + data.current.version : 'Chưa có cài đặt; không cho chọn đón.'}</p>
    <form className="admin-settings-form" onSubmit={save}>
      <h3>Bậc khoảng cách</h3>
      {tiers.map((tier, index) => <fieldset key={index}>
        <legend>Bậc {index + 1}</legend>
        <Input label="Từ (km)" type="number" min="0" step="any" required value={tier.fromKm} onChange={event => change(index, 'fromKm', event.target.value)} />
        <Input label="Đến (km)" type="number" min="0" step="any" required value={tier.toKm} onChange={event => change(index, 'toKm', event.target.value)} />
        <Input label="Phí (VND)" type="number" min="0" step="1" required value={tier.feeVnd} onChange={event => change(index, 'feeVnd', event.target.value)} />
        <Button type="button" variant="secondary" disabled={tiers.length === 1} onClick={() => setTiers(old => old.filter((_, i) => i !== index))}>Xóa dòng</Button>
      </fieldset>)}
      <Button type="button" variant="secondary" onClick={() => setTiers(old => [...old, { fromKm: old.at(-1).toKm, toKm: '', feeVnd: '' }])}>Thêm dòng</Button>
      <Input label="Khoảng cách đón tối đa (km)" value={maxKm} readOnly />
      {!valid && <p>Các bậc phải bắt đầu từ 0, nối liền và có phí nguyên không âm.</p>}
      <Input label="Thời điểm hiệu lực đón thú" type="datetime-local" required value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} />
      <Input label="Lý do thay đổi phí đón" required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
      <Button type="submit" disabled={!valid} loading={pending}>Lưu phiên bản phí đón</Button>
      {feedback && <Notice state="error" title="Chưa hoàn tất">{feedback}</Notice>}
    </form>
    <h3>Lịch sử phiên bản đón thú</h3>
    <ol className="admin-settings-history-list">{data.versions.map(item => <li key={item.version}>
      <strong>Phiên bản {item.version}</strong><p>{item.reason} · {item.maxKm} km</p>
      <p>{item.tiers.map(tier => tier.fromKm + '–' + tier.toKm + ' km: ' + tier.feeVnd.toLocaleString('vi-VN') + ' VND').join(' · ')}</p>
      <small>{new Date(item.effectiveAt).toLocaleString('vi-VN')} · Actor ID {item.changedBy}</small>
    </li>)}</ol>
  </>;
}

export function AdminSystemSettingsPage({ apiRequest: suppliedRequest }) {
  const session = useSession();
  const isAdmin = session.user?.roles?.includes('ADMIN');
  const canView = session.user?.roles?.some(role => role === 'STAFF' || role === 'ADMIN');
  const [enabled, setEnabled] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localDateTime());
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [faultyDays, setFaultyDays] = useState('7');
  const [faultyDaysError, setFaultyDaysError] = useState('');
  const [savingFaultyDays, setSavingFaultyDays] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const apiRequest = useMemo(() => suppliedRequest ?? createApiClient({
    getCsrfToken: session.getCsrfToken, onUnauthorized: session.invalidate
  }), [suppliedRequest, session.getCsrfToken, session.invalidate]);
  const load = useCallback(options => apiRequest('/system-settings/service-catalog', options), [apiRequest]);
  const resource = useApiResource(load);
  const overview = resource.data;
  const current = overview?.catalogVisibility;
  const currentFaultyDays = overview?.faultyProductReportDays;

  useEffect(() => {
    if (currentFaultyDays?.days !== undefined) {
      setFaultyDays(String(currentFaultyDays.days));
    }
  }, [currentFaultyDays?.days, currentFaultyDays?.version]);

  const saveFaultyDays = async event => {
    event.preventDefault();
    if (!isAdmin || savingFaultyDays) return;
    const trimmed = String(faultyDays).trim();
    const parsed = Number(trimmed);
    if (!/^[1-9]\d*$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 365) {
      setFaultyDaysError('Vui lòng nhập số nguyên lớn hơn 0.');
      return;
    }
    setSavingFaultyDays(true);
    setFaultyDaysError('');
    setFeedback(null);
    try {
      await apiRequest('/system-settings/faulty-product-report-days', {
        method: 'PUT',
        body: { expectedVersion: currentFaultyDays?.version ?? 0, days: parsed }
      });
      setToastMessage('Đã lưu thay đổi.');
      resource.retry();
    } catch (error) {
      setFaultyDaysError(error?.status === 422 ? 'Vui lòng nhập số nguyên lớn hơn 0.' : errorMessage(error));
    } finally {
      setSavingFaultyDays(false);
    }
  };

  const save = async event => {
    event.preventDefault();
    if (!isAdmin || pending) return;
    const date = new Date(effectiveAt);
    if (!Number.isFinite(date.getTime())) {
      setFeedback({ state: 'error', text: 'Chọn thời điểm hiệu lực hợp lệ.' });
      return;
    }
    setPending(true); setFeedback(null);
    const body = {
      expectedVersion: overview?.latestVersion ?? 0, enabled: (enabled || String(current?.enabled ?? false)) === 'true',
      effectiveAt: date.toISOString(), reason: reason.trim()
    };
    try {
      const response = await apiRequest('/system-settings/service-catalog/visibility', { method: 'POST', body });
      if (response.pending) setFeedback({ state: 'pending', text: 'Yêu cầu đang xử lý. Tải lại để xác nhận.' });
      else {
        setFeedback({ state: 'success', text: 'Máy chủ đã ghi nhận cấu hình mới.' });
        setEnabled(''); setReason(''); setEffectiveAt(localDateTime()); resource.retry();
      }
    } catch (error) {
      setFeedback({ state: error.status === 403 ? 'forbidden' : 'error', text: errorMessage(error) });
    } finally { setPending(false); }
  };

  if (session.status === 'loading' || session.status === 'pending') {
    return <main className="admin-system-settings"><Notice state="loading" title="Đang kiểm tra phiên">Đang xác minh quyền truy cập.</Notice></main>;
  }
  if (!canView) {
    return <main className="admin-system-settings"><Notice state="forbidden" title="Không có quyền xem cấu hình">
      Chỉ nhân viên được phân quyền và quản trị viên mới xem được thông tin hệ thống.
    </Notice></main>;
  }

  return <main className="admin-system-settings">
    <a className="admin-settings-skip" href="#settings-content">Bỏ qua đến nội dung</a>
    <header className="admin-settings-header">
      <BrandLogo className="admin-settings-logo" />
      <p className="admin-settings-eyebrow">CÀI ĐẶT QUẢN TRỊ</p>
      <h1>Cài đặt hệ thống</h1>
      <p>Cấu hình công khai danh mục và xem quy ước tiền tệ đang áp dụng.</p>
      <span className="admin-settings-provisional">Đề xuất · Figma chưa đối chiếu</span>
    </header>
    <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    {feedback && <Notice state={feedback.state} title={feedback.state === 'success' ? 'Đã lưu' : 'Chưa hoàn tất'}>{feedback.text}</Notice>}
    <section id="settings-content" className="admin-settings-grid">
      <section className="admin-settings-card" aria-labelledby="currency-heading">
        <p className="admin-settings-eyebrow">TIỀN TỆ</p><h2 id="currency-heading">Quy ước giá</h2>
        <dl className="admin-settings-facts">
          <div><dt>Tiền tệ</dt><dd>{overview?.currency?.code ?? 'VND'}</dd></div>
          <div><dt>Đơn vị nhỏ nhất</dt><dd>{overview?.currency?.unitVnd ?? 1} VND</dd></div>
          <div><dt>Đầu vào</dt><dd>Số nguyên không âm</dd></div>
          <div><dt>Làm tròn</dt><dd>Từ chối số lẻ; không tự làm tròn</dd></div>
        </dl>
        <p className="admin-settings-help">Giá dịch vụ lưu theo số nguyên VND. Đơn vị tính được ghi riêng cho từng phiên bản giá.</p>
      </section>
      <section className="admin-settings-card" aria-labelledby="catalog-setting-heading">
        <div className="admin-settings-card-heading">
          <div><p className="admin-settings-eyebrow">DANH MỤC CÔNG KHAI</p><h2 id="catalog-setting-heading">Hiển thị dịch vụ</h2></div>
          <span className={'admin-settings-state ' + (current?.enabled ? 'is-enabled' : 'is-disabled')}>
            {current?.enabled ? 'Đang bật' : 'Đang tắt'}
          </span>
        </div>
        {resource.status === 'loading' && <Notice state="loading" title="Đang tải cài đặt">Đang lấy dữ liệu mới nhất.</Notice>}
        {resource.status === 'pending' && <Notice state="pending" title="Cấu hình đang chờ">Máy chủ chưa xác nhận dữ liệu cuối cùng.</Notice>}
        {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem">Yêu cầu này không được phép.</Notice>}
        {resource.status === 'error' && <Notice state="error" title="Không tải được cấu hình"
          action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Kiểm tra kết nối rồi thử lại.</Notice>}
        {resource.status === 'success' && <p className="admin-settings-effective">
          Hiệu lực từ {current?.effectiveAt
            ? new Date(current.effectiveAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
            : 'chưa được bật; mặc định an toàn là tắt'}.
        </p>}
        {isAdmin && resource.status === 'success' && <form className="admin-settings-form" onSubmit={save}>
          <Select label="Danh mục dịch vụ" value={enabled || String(current?.enabled ?? false)}
            onChange={event => setEnabled(event.target.value)}>
            <option value="true">Cho phép hiển thị và nhận booking mới</option>
            <option value="false">Ẩn danh mục và chặn booking mới</option>
          </Select>
          <Input label="Thời điểm hiệu lực" type="datetime-local" required value={effectiveAt}
            onChange={event => setEffectiveAt(event.target.value)} />
          <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={reason}
            onChange={event => setReason(event.target.value)} />
          <Button type="submit" loading={pending} loadingLabel="Đang lưu…">Lưu phiên bản cài đặt</Button>
        </form>}
        {!isAdmin && <p className="admin-settings-help">Nhân viên có thể xem cấu hình. Thay đổi chỉ dành cho quản trị viên.</p>}
      </section>
      <section className="admin-settings-card" aria-labelledby="faulty-days-heading">
        <p className="admin-settings-eyebrow">CỬA HÀNG</p>
        <h2 id="faulty-days-heading">Báo sản phẩm lỗi</h2>
        <p className="admin-settings-help">
          Thời hạn khách được báo sản phẩm lỗi hoặc giao sai tính từ ngày giao hàng hoặc ngày nhận tại cửa hàng (mặc định 7 ngày).
        </p>
        <p className="admin-settings-effective">
          Đang áp dụng: <strong>{currentFaultyDays?.days ?? 7} ngày</strong>.
        </p>
        {isAdmin && resource.status === 'success' && (
          <form className="admin-settings-form" onSubmit={saveFaultyDays} noValidate>
            <Input
              label="Thời hạn báo sản phẩm lỗi (ngày)"
              type="number"
              min={1}
              max={365}
              step={1}
              required
              value={faultyDays}
              onChange={event => {
                setFaultyDays(event.target.value);
                if (faultyDaysError) setFaultyDaysError('');
              }}
            />
            {faultyDaysError && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{faultyDaysError}</p>}
            <Button type="submit" loading={savingFaultyDays} loadingLabel="Đang lưu…">
              Lưu thời hạn báo lỗi
            </Button>
          </form>
        )}
      </section>
      <section className="admin-settings-card admin-settings-history" aria-labelledby="settings-history-heading">
        <div className="admin-settings-card-heading"><div><p className="admin-settings-eyebrow">KIỂM TOÁN</p>
          <h2 id="settings-history-heading">Lịch sử thay đổi</h2></div><Button variant="secondary" onClick={resource.retry}>Tải lại</Button></div>
        {resource.status === 'success' && overview.history?.length === 0
          ? <Notice state="empty" title="Chưa có thay đổi">Danh mục vẫn đang tắt theo mặc định.</Notice>
          : <ol className="admin-settings-history-list">{(overview?.history ?? []).map(item => <li key={item.version}>
            <div><strong>{item.enabled ? 'Đã bật danh mục' : 'Đã tắt danh mục'}</strong><span>Phiên bản {item.version}</span></div>
            <p>{item.reason}</p>
            <small>Hiệu lực {new Date(item.effectiveAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · Actor ID {item.changedBy}</small>
          </li>)}</ol>}
      </section>
      {isAdmin && <PickupSettings apiRequest={apiRequest} />}
    </section>
  </main>;
}
