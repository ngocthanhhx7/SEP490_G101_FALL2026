import { useCallback, useMemo, useState } from 'react';
import { BrandLogo, Button, Input, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import './admin-service-prices.css';

const localDateTime = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const errorMessage = error => {
  if (error?.status === 401) return 'Phiên làm việc đã hết hạn. Đăng nhập lại rồi thử tiếp.';
  if (error?.status === 403) return 'Chỉ quản trị viên được thay đổi cấu hình giá.';
  if (error?.status === 409) return 'Giá vừa được thay đổi ở nơi khác. Tải lại trước khi tiếp tục.';
  if (error?.status === 422) return 'Giá phải là số nguyên VND không âm và các trường khác phải hợp lệ.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') return 'Chưa nhận được xác nhận. Tải lại để kiểm tra trạng thái.';
  return 'Không thể hoàn tất yêu cầu. Hãy tải lại và thử lại sau.';
};
const money = value => Number.isSafeInteger(value)
  ? new Intl.NumberFormat('vi-VN').format(value) + ' ₫' : 'Không hợp lệ';

export function AdminServicePricesPage({ apiRequest: suppliedRequest }) {
  const session = useSession();
  const isAdmin = session.user?.roles?.includes('ADMIN');
  const canView = session.user?.roles?.some(role => role === 'STAFF' || role === 'ADMIN');
  const [selectedId, setSelectedId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  const [effectiveAt, setEffectiveAt] = useState(localDateTime());
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const apiRequest = useMemo(() => suppliedRequest ?? createApiClient({
    getCsrfToken: session.getCsrfToken, onUnauthorized: session.invalidate
  }), [suppliedRequest, session.getCsrfToken, session.invalidate]);
  const loadServices = useCallback(options => apiRequest('/services/admin', options), [apiRequest]);
  const servicesResource = useApiResource(loadServices);
  const services = Array.isArray(servicesResource.data) ? servicesResource.data : [];
  const selected = services.find(service => service.id === selectedId) ?? services[0] ?? null;
  const loadPrices = useCallback(options => selected
    ? apiRequest('/service-prices/admin/' + selected.id, options)
    : Promise.resolve({ data: { prices: [], latestVersion: 0 } }), [apiRequest, selected?.id]);
  const pricesResource = useApiResource(loadPrices);
  const prices = pricesResource.data?.prices ?? [];

  const save = async event => {
    event.preventDefault();
    if (!selected || !isAdmin || pending) return;
    if (!/^(0|[1-9]\d*)$/.test(amountText) || !Number.isSafeInteger(Number(amountText))) {
      setFeedback({ state: 'error', text: 'Nhập số nguyên VND từ 0 đến giới hạn số nguyên an toàn.' });
      return;
    }
    const date = new Date(effectiveAt);
    if (!Number.isFinite(date.getTime())) {
      setFeedback({ state: 'error', text: 'Chọn thời điểm hiệu lực hợp lệ.' });
      return;
    }
    setPending(true); setFeedback(null);
    const body = {
      expectedVersion: pricesResource.data?.latestVersion ?? 0,
      amountVnd: Number(amountText), unitLabel: unitLabel.trim(), effectiveAt: date.toISOString(), reason: reason.trim()
    };
    try {
      const response = await apiRequest('/service-prices/admin/' + selected.id, { method: 'POST', body });
      if (response.pending) setFeedback({ state: 'pending', text: 'Yêu cầu đang xử lý. Tải lại để xác nhận.' });
      else {
        setFeedback({ state: 'success', text: 'Máy chủ đã ghi nhận phiên bản giá mới.' });
        setAmountText(''); setUnitLabel(''); setReason(''); setEffectiveAt(localDateTime());
        pricesResource.retry();
      }
    } catch (error) {
      setFeedback({ state: error.status === 403 ? 'forbidden' : 'error', text: errorMessage(error) });
    } finally { setPending(false); }
  };

  if (session.status === 'loading' || session.status === 'pending') {
    return <main className="admin-service-prices"><Notice state="loading" title="Đang kiểm tra phiên">Đang xác minh quyền truy cập.</Notice></main>;
  }
  if (!canView) {
    return <main className="admin-service-prices"><Notice state="forbidden" title="Không có quyền xem giá">
      Chỉ nhân viên được phân quyền và quản trị viên mới xem được cấu hình.
    </Notice></main>;
  }

  return <main className="admin-service-prices">
    <a className="admin-service-prices-skip" href="#price-content">Bỏ qua đến nội dung</a>
    <header className="admin-price-header">
      <BrandLogo className="admin-price-logo" />
      <p className="admin-price-eyebrow">QUẢN TRỊ GIÁ</p>
      <h1>Cấu hình giá dịch vụ</h1>
      <p>Giá được lưu bằng VND nguyên và có thời điểm hiệu lực. Giá mới không sửa snapshot của booking đã tạo.</p>
      <span className="admin-price-provisional">Đề xuất · Figma chưa đối chiếu</span>
    </header>
    {feedback && <Notice state={feedback.state} title={feedback.state === 'success' ? 'Đã lưu' : 'Chưa hoàn tất'}>{feedback.text}</Notice>}
    <section id="price-content" className="admin-price-layout">
      <aside className="admin-price-service-list">
        <div className="admin-price-section-heading"><p className="admin-price-eyebrow">DỊCH VỤ</p><Button variant="secondary" onClick={servicesResource.retry}>Tải lại</Button></div>
        {servicesResource.status === 'loading' && <Notice state="loading" title="Đang tải dịch vụ">Đang lấy danh mục từ máy chủ.</Notice>}
        {servicesResource.status === 'error' && <Notice state="error" title="Không tải được dịch vụ"
          action={<Button variant="secondary" onClick={servicesResource.retry}>Thử lại</Button>}>Kiểm tra kết nối rồi thử lại.</Notice>}
        {servicesResource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem">Yêu cầu này không được phép.</Notice>}
        {servicesResource.status === 'empty' && <Notice state="empty" title="Chưa có dịch vụ">Tạo dịch vụ trước khi cấu hình giá.</Notice>}
        {services.length > 0 && <ul className="admin-price-service-items">{services.map(service => <li key={service.id}>
          <button type="button" aria-pressed={selected?.id === service.id} onClick={() => setSelectedId(service.id)}>
            <strong>{service.name}</strong><small>{service.code}</small>
          </button>
        </li>)}</ul>}
      </aside>
      <section className="admin-price-detail" aria-label={selected ? 'Giá của ' + selected.name : 'Giá dịch vụ'}>
        <h2>{selected?.name ?? 'Chọn dịch vụ'}</h2>
        <p className="admin-price-contract">Đơn vị tiền: <strong>VND</strong>. Số lẻ nhỏ hơn 1 VND bị từ chối; hệ thống không tự làm tròn.
          Đơn vị áp dụng được ghi rõ trên từng phiên bản giá.</p>
        {pricesResource.status === 'loading' && <Notice state="loading" title="Đang tải lịch sử giá">Đang lấy dữ liệu mới nhất.</Notice>}
        {pricesResource.status === 'error' && <Notice state="error" title="Không tải được giá"
          action={<Button variant="secondary" onClick={pricesResource.retry}>Thử lại</Button>}>Kiểm tra kết nối rồi thử lại.</Notice>}
        {pricesResource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem giá">Yêu cầu này không được phép.</Notice>}
        {pricesResource.status === 'empty' && <Notice state="empty" title="Chưa cấu hình giá">Dịch vụ chưa có phiên bản giá hiệu lực.</Notice>}
        {prices.length === 0 && pricesResource.status === 'success'
          && <Notice state="empty" title="Chưa cấu hình giá">Dịch vụ chưa có phiên bản giá hiệu lực.</Notice>}
        {prices.length > 0 && <ol className="admin-price-history">{prices.map(price => <li key={price.version}>
          <div><strong>{money(price.amountVnd)}</strong><span>{price.unitLabel}</span></div>
          <small>Phiên bản {price.version} · hiệu lực {new Date(price.effectiveAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small>
        </li>)}</ol>}
        {isAdmin && selected && <form className="admin-price-form" onSubmit={save}>
          <h3>Tạo phiên bản giá</h3>
          <Input label="Giá (VND)" required inputMode="numeric" pattern="(0|[1-9][0-9]*)" value={amountText}
            onChange={event => setAmountText(event.target.value)} hint="Chỉ nhập số nguyên không âm; không nhập dấu phân cách." />
          <Input label="Đơn vị áp dụng" required minLength={2} maxLength={80} value={unitLabel}
            onChange={event => setUnitLabel(event.target.value)} hint="Dùng đơn vị tính đã được nhóm thống nhất cho dịch vụ." />
          <Input label="Thời điểm hiệu lực" type="datetime-local" required value={effectiveAt}
            onChange={event => setEffectiveAt(event.target.value)} />
          <Input label="Lý do thay đổi" required minLength={3} maxLength={500} value={reason}
            onChange={event => setReason(event.target.value)} />
          <Button type="submit" loading={pending} loadingLabel="Đang lưu…">Lưu phiên bản giá</Button>
        </form>}
      </section>
    </section>
  </main>;
}
