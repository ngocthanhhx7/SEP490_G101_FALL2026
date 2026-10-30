import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, ShieldCheck } from 'lucide-react';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createCustomerProfileAdapter } from '../../services/customer-profile-adapter.js';
import './customer-profile.css';

function requestMessage(error) {
  if (error?.status === 401) return 'Phiên đã hết hạn. Vui lòng đăng nhập lại rồi tiếp tục.';
  if (error?.status === 403) return 'Tài khoản hiện tại không có quyền xem hồ sơ này.';
  if (error?.status === 404) return 'Không tìm thấy hồ sơ Customer của tài khoản này.';
  if (error?.status === 409) return 'Hồ sơ đã được cập nhật ở nơi khác. Tải lại trước khi lưu tiếp.';
  if (error?.code === 'CSRF_NOT_READY') return 'Phiên bảo mật chưa sẵn sàng. Vui lòng đăng nhập lại.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return 'Chưa nhận được xác nhận từ máy chủ. Tải lại hồ sơ để kiểm tra trạng thái trước khi lưu lại.';
  }
  return 'Không thể lưu hồ sơ lúc này. Kiểm tra thông tin rồi thử lại.';
}

function verifiedDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Đã xác minh';
  return `Đã xác minh ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date)}`;
}

export function CustomerProfilePage({ apiRequest }) {
  const session = useSession();
  const api = useMemo(() => apiRequest ?? createApiClient({
    getCsrfToken: session.getCsrfToken,
    onUnauthorized: session.invalidate
  }), [apiRequest, session.getCsrfToken, session.invalidate]);
  const profileAdapter = useMemo(() => createCustomerProfileAdapter(api), [api]);
  const loadProfile = useCallback(({ signal }) => profileAdapter.load({ signal }), [profileAdapter]);
  const profile = useApiResource(loadProfile);
  const [draft, setDraft] = useState({ value: '', version: null });
  const displayName = profile.status === 'success' && draft.version === profile.data.version
    ? draft.value : (profile.data?.displayName ?? '');
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savePendingNotice, setSavePendingNotice] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (profile.status !== 'success' || savePending) return;
    const normalizedName = displayName.normalize('NFC').replace(/[\s\u00a0]+/gu, ' ').trim();
    if (!normalizedName || normalizedName.length > 100) return;
    setSavePending(true);
    setSaveError('');
    setSavePendingNotice(false);
    setSaved(false);
    try {
      const result = await profileAdapter.update({ displayName: normalizedName, expectedVersion: profile.data.version });
      if (result.pending) {
        setSavePendingNotice(true);
        profile.retry();
      } else {
        setSaved(true);
        profile.retry();
      }
    } catch (error) {
      setSaveError(requestMessage(error));
      if (error?.status === 401) session.invalidate();
    } finally {
      setSavePending(false);
    }
  }

  return <section className="customer-profile" aria-labelledby="customer-profile-title">
    <div className="customer-profile-heading">
      <h1 id="customer-profile-title">Hồ sơ của tôi</h1>
      <p>Quản lý thông tin cá nhân và liên hệ của bạn.</p>
    </div>

    {profile.status === 'loading' && <div className="customer-profile-loading" role="status" aria-label="Đang tải hồ sơ">
      <span /><span /><span />
    </div>}
    {profile.status === 'pending' && <Notice state="pending" title="Đang chờ máy chủ xác nhận">
      Hồ sơ chưa có phản hồi hoàn tất. Bạn có thể tải lại để kiểm tra.
      <Button variant="secondary" onClick={profile.retry}>Tải lại hồ sơ</Button>
    </Notice>}
    {profile.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem hồ sơ">
      Chỉ Customer đã đăng nhập mới xem được hồ sơ Customer.
    </Notice>}
    {profile.status === 'error' && <Notice state="error" title="Không tải được hồ sơ"
      action={<Button variant="secondary" onClick={profile.retry}>Thử lại</Button>}>
      {requestMessage({ code: profile.code })}
    </Notice>}
    {profile.status === 'empty' && <Notice state="empty" title="Chưa có hồ sơ Customer">
      Hoàn tất đăng ký Customer để tạo hồ sơ.
    </Notice>}

    {profile.status === 'success' && <div className="customer-profile-grid">
      <section className="customer-profile-card" aria-labelledby="profile-details-title">
        <div className="customer-profile-card-heading">
          <h2 id="profile-details-title">Thông tin cá nhân</h2>
        </div>
        <form className="customer-profile-form" onSubmit={submit}>
          <Input label="Họ và tên" value={displayName} onChange={event => {
            setDraft({ value: event.target.value, version: profile.data.version });
            setSaveError('');
            setSaved(false);
          }} autoComplete="name" maxLength={100} required />
          <Button type="submit" loading={savePending} loadingLabel="Đang lưu…"
            disabled={displayName.trim() === profile.data.displayName || !displayName.trim() || displayName.length > 100}>
            Lưu thay đổi
          </Button>
        </form>
        {saveError && <Notice state="error" title="Chưa xác nhận thay đổi"
          action={<Button variant="secondary" onClick={() => { setSaveError(''); profile.retry(); }}>Tải lại hồ sơ</Button>}>
          {saveError}
        </Notice>}
        {savePendingNotice && <Notice state="pending" title="Đang đối chiếu thay đổi">
          Máy chủ đã nhận yêu cầu xử lý. Tải lại hồ sơ để xem kết quả đã lưu.
          <Button variant="secondary" onClick={profile.retry}>Đối chiếu hồ sơ</Button>
        </Notice>}
        {saved && <Notice state="success" title="Đã gửi yêu cầu cập nhật">
          Hồ sơ đang được tải lại từ máy chủ để xác nhận thông tin mới.
        </Notice>}
      </section>

      <section className="customer-profile-card" aria-labelledby="profile-contacts-title">
        <div className="customer-profile-card-heading">
          <h2 id="profile-contacts-title">Thông tin liên hệ</h2>
        </div>
        {profile.data.contacts?.length ? <ul className="customer-profile-contacts">
          {profile.data.contacts.map((contact, index) => <li key={`${contact.channel}-${index}`}>
            <span className="customer-profile-contact-icon" aria-hidden="true">{contact.channel === 'EMAIL' ? <Mail size={18} /> : <Phone size={18} />}</span>
            <span><strong>{contact.channel === 'EMAIL' ? 'Email' : 'Điện thoại'}</strong>
              <small>{verifiedDate(contact.verifiedAt)}</small></span>
            <b>{contact.maskedValue}</b>
            <Link to="/account/settings">Thay đổi</Link>
          </li>)}
        </ul> : <Notice state="empty" title="Chưa có kênh liên hệ đã xác minh">
          Thông tin liên hệ sẽ hiển thị sau khi được xác minh.
        </Notice>}
        <p className="customer-profile-private-note"><ShieldCheck size={18} aria-hidden="true" />Liên hệ được che để bảo vệ tài khoản. Thay đổi cần xác minh bằng OTP.</p>
      </section>
    </div>}
  </section>;
}
