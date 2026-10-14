import { useCallback, useMemo, useState } from 'react';
import { BrandLogo, Button, Input, Notice, Select } from '../../components/ui/index.js';
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

export function AdminSystemSettingsPage({ apiRequest: suppliedRequest }) {
  const session = useSession();
  const isAdmin = session.user?.roles?.includes('ADMIN');
  const canView = session.user?.roles?.some(role => role === 'STAFF' || role === 'ADMIN');
  const [enabled, setEnabled] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localDateTime());
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const apiRequest = useMemo(() => suppliedRequest ?? createApiClient({
    getCsrfToken: session.getCsrfToken, onUnauthorized: session.invalidate
  }), [suppliedRequest, session.getCsrfToken, session.invalidate]);
  const load = useCallback(options => apiRequest('/system-settings/service-catalog', options), [apiRequest]);
  const resource = useApiResource(load);
  const overview = resource.data;
  const current = overview?.catalogVisibility;

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
    </section>
  </main>;
}
