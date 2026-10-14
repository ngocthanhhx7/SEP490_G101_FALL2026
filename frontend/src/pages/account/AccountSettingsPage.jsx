import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { normalizeRegistrationContact } from '../../services/customer-registration-api.js';
import { createApiClient } from '../../services/api-client.js';
import { createAccountSettingsApi } from '../../services/account-settings-api.js';
import './account-settings.css';

const CHANNELS = [
  { id: 'EMAIL', label: 'Email', type: 'email', autocomplete: 'email', placeholder: 'ban@example.com' },
  { id: 'PHONE', label: 'Số điện thoại', type: 'tel', autocomplete: 'tel', placeholder: '+84912345678' }
];
const ROLE_LABELS = {
  CUSTOMER: 'Khách hàng', PET_SITTER: 'Pet sitter', STAFF: 'Nhân viên', ADMIN: 'Quản trị viên'
};

function errorMessage(error) {
  if (error?.code === 'CONTACT_UNAVAILABLE') {
    return 'Liên hệ này không thể dùng cho tài khoản. Nếu bạn cần trợ giúp, hãy liên hệ bộ phận hỗ trợ. Hệ thống không tự gộp tài khoản.';
  }
  if (error?.code === 'PROVIDER_UNAVAILABLE') {
    return 'Chưa gửi được mã xác minh. Liên hệ hiện tại vẫn hoạt động; hãy thử lại sau.';
  }
  if (error?.code === 'OTP_INVALID_OR_EXPIRED') {
    return 'Mã không đúng hoặc đã hết hạn. Kiểm tra mã hoặc yêu cầu mã mới.';
  }
  if (error?.code === 'OTP_RATE_LIMITED') {
    return 'Bạn đã yêu cầu hoặc nhập mã quá nhiều lần. Hãy chờ một lúc rồi thử lại.';
  }
  if (error?.code === 'FORBIDDEN' || error?.status === 403) {
    return 'Phiên không có quyền thay đổi thông tin liên hệ.';
  }
  if (error?.code === 'CSRF_NOT_READY') {
    return 'Kết nối phiên an toàn chưa sẵn sàng. Hãy tải lại trang sau khi đăng nhập lại.';
  }
  return 'Không thể hoàn tất thao tác lúc này. Thử lại sau.';
}

function verifiedContact(contacts, channel) {
  return contacts.find(contact => contact.channel === channel && contact.state === 'VERIFIED');
}

export function AccountSettingsPage({ api: suppliedApi } = {}) {
  const session = useSession();
  const request = useMemo(() => suppliedApi ? null : createApiClient({
    getCsrfToken: session.getCsrfToken ?? (() => null),
    onUnauthorized: session.invalidate ?? (() => {})
  }), [session.getCsrfToken, session.invalidate, suppliedApi]);
  const defaultApi = useMemo(() => suppliedApi ? null : createAccountSettingsApi({ request }), [request, suppliedApi]);
  const api = suppliedApi ?? defaultApi;
  const user = session.user ?? {};
  const roles = Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean);
  const canChangeContacts = Boolean(suppliedApi
    || (typeof session.getCsrfToken === 'function' && session.getCsrfToken()));

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [contactInput, setContactInput] = useState('');
  const [code, setCode] = useState('');
  const [flow, setFlow] = useState(null);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadContacts = useCallback(async (signal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.getContacts({ signal });
      setContacts(result);
    } catch (error) {
      if (error?.code !== 'ABORTED') setLoadError(error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    loadContacts(controller.signal);
    return () => controller.abort();
  }, [loadContacts]);

  useEffect(() => {
    if (!flow) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [flow]);

  function closeFlow() {
    setActiveChannel(null);
    setContactInput('');
    setCode('');
    setFlow(null);
    setFieldError('');
    setNotice({ state: 'info', title: 'Đã hủy bước xác minh', message: 'Liên hệ hiện tại không thay đổi.' });
  }

  async function sendCode(channel, value) {
    setPending(true);
    setFieldError('');
    setNotice(null);
    try {
      const challenge = await api.requestContactOtp({ channel, contact: value });
      const startedAt = Date.now();
      setFlow({ channel, contact: value, challengeId: challenge.challengeId,
        expiresAt: startedAt + challenge.expiresInSeconds * 1000,
        resendAt: startedAt + challenge.resendAfterSeconds * 1000 });
      setCode('');
      setNotice({ state: 'pending', title: 'Đã yêu cầu mã xác minh',
        message: `Kiểm tra ${channel === 'EMAIL' ? 'email' : 'điện thoại'} vừa nhập. Liên hệ đang dùng vẫn giữ nguyên cho đến khi mã được xác minh.` });
    } catch (error) {
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', title: 'Không gửi được mã', message: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function submitContact(event) {
    event.preventDefault();
    if (!activeChannel) return;
    const contact = normalizeRegistrationContact(activeChannel, contactInput);
    if (!contact) {
      setFieldError(activeChannel === 'EMAIL' ? 'Nhập email hợp lệ.' : 'Nhập số điện thoại hợp lệ, ví dụ +84912345678.');
      return;
    }
    await sendCode(activeChannel, contact);
  }

  async function submitCode(event) {
    event.preventDefault();
    if (!flow || !/^\d{6}$/.test(code)) {
      setFieldError('Nhập đủ 6 chữ số trong mã xác minh.');
      return;
    }
    if (now >= flow.expiresAt) {
      setFieldError('Mã đã hết hạn. Yêu cầu mã mới để tiếp tục.');
      return;
    }
    setPending(true);
    setFieldError('');
    setNotice(null);
    try {
      await api.verifyContact({ ...flow, code });
      setFlow(null);
      setActiveChannel(null);
      setContactInput('');
      setCode('');
      await loadContacts();
      setNotice({ state: 'success', title: 'Đã cập nhật liên hệ', message: 'Kênh mới đã được xác minh và liên kết với tài khoản này.' });
    } catch (error) {
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', title: 'Chưa cập nhật liên hệ', message: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  const secondsToResend = flow ? Math.max(0, Math.ceil((flow.resendAt - now) / 1000)) : 0;
  const secondsToExpire = flow ? Math.max(0, Math.ceil((flow.expiresAt - now) / 1000)) : 0;

  return <section className="account-settings" aria-labelledby="account-settings-title">
    <div className="account-settings-breadcrumb"><Link to="/account">Tài khoản</Link><span aria-hidden="true">/</span><strong>Cài đặt</strong></div>
    <header className="account-settings-heading">
      <span className="account-settings-eyebrow">BẢO MẬT TÀI KHOẢN</span>
      <h1 id="account-settings-title">Cài đặt tài khoản</h1>
      <p>Quản lý các kênh liên hệ có thể dùng để đăng nhập Paw World Care.</p>
    </header>

    {notice && <Notice state={notice.state} title={notice.title}>{notice.message}</Notice>}
    {!canChangeContacts && <Notice state="pending" title="Đang chờ kết nối phiên an toàn">
      Bạn vẫn có thể xem liên hệ đã xác minh. Thêm hoặc đổi liên hệ sẽ khả dụng sau khi phiên đăng nhập và CSRF được tích hợp.
    </Notice>}

    <section className="account-settings-card" aria-labelledby="account-settings-identity-title">
      <div className="account-settings-card-heading">
        <div><span className="account-settings-eyebrow">HỒ SƠ</span><h2 id="account-settings-identity-title">Thông tin tài khoản</h2></div>
        <span className="account-settings-readonly">Chỉ xem</span>
      </div>
      <div className="account-settings-identity">
        <Input label="Họ và tên" value={user.displayName ?? ''} readOnly />
        <div className="account-settings-roles" aria-label="Vai trò tài khoản">
          <span className="account-settings-label">Vai trò</span>
          <p>{roles.length ? roles.map(role => ROLE_LABELS[role] ?? role).join(', ') : 'Chưa có thông tin'}</p>
        </div>
      </div>
      <p className="account-settings-caption">Tên khách hàng được sửa trong hồ sơ cá nhân. Cài đặt này không thay đổi tên hoặc vai trò.</p>
    </section>

    <section className="account-settings-card" aria-labelledby="account-settings-contacts-title">
      <div className="account-settings-card-heading">
        <div><span className="account-settings-eyebrow">LIÊN HỆ</span><h2 id="account-settings-contacts-title">Email và số điện thoại</h2></div>
        <span className="account-settings-readonly">OTP bắt buộc</span>
      </div>
      <p className="account-settings-caption">Liên hệ mới chỉ thay thế cùng kênh sau khi mã OTP hợp lệ. Kênh khác vẫn được giữ lại.</p>
      {loading && <p className="account-settings-state" role="status">Đang tải liên hệ…</p>}
      {loadError && <Notice state={loadError.status === 403 ? 'forbidden' : 'error'} title="Không tải được liên hệ">
        {errorMessage(loadError)}
        <div className="account-settings-retry"><Button variant="secondary" onClick={() => loadContacts()}>Thử lại</Button></div>
      </Notice>}
      {!loading && !loadError && contacts.length === 0 && <p className="account-settings-state">Chưa có liên hệ đã xác minh.</p>}

      <div className="account-settings-contact-list">
        {CHANNELS.map(channel => {
          const current = verifiedContact(contacts, channel.id);
          return <article className="account-settings-contact" key={channel.id}>
            <div className="account-settings-contact-copy">
              <span className="account-settings-label">{channel.label}</span>
              {current
                ? <><strong>{current.value}</strong><span className="account-settings-verified"><span aria-hidden="true" />Đã xác minh</span></>
                : <span className="account-settings-unlinked">Chưa liên kết</span>}
            </div>
            <Button variant="secondary" disabled={!canChangeContacts || pending || Boolean(flow)}
              onClick={() => { setActiveChannel(channel.id); setFieldError(''); setNotice(null); }}>
              {current ? `Đổi ${channel.label.toLocaleLowerCase('vi-VN')}` : `Thêm ${channel.label.toLocaleLowerCase('vi-VN')}`}
            </Button>
          </article>;
        })}
      </div>

      {activeChannel && !flow && (() => {
        const channel = CHANNELS.find(item => item.id === activeChannel);
        return <form className="account-settings-form" onSubmit={submitContact}>
          <h3>{verifiedContact(contacts, activeChannel) ? `Đổi ${channel.label.toLocaleLowerCase('vi-VN')}` : `Liên kết ${channel.label.toLocaleLowerCase('vi-VN')}`}</h3>
          <Input label={channel.label} type={channel.type} autoComplete={channel.autocomplete} inputMode={channel.id === 'PHONE' ? 'tel' : undefined}
            placeholder={channel.placeholder} value={contactInput} onChange={event => setContactInput(event.target.value)}
            required disabled={pending} error={fieldError} hint={channel.id === 'PHONE' ? 'Có thể nhập số Việt Nam hoặc dạng quốc tế +84.' : 'Mã xác minh sẽ được gửi đến địa chỉ này.'} />
          <div className="account-settings-actions">
            <Button type="submit" loading={pending} loadingLabel="Đang gửi mã…">Gửi mã xác minh</Button>
            <Button variant="ghost" disabled={pending} onClick={closeFlow}>Hủy</Button>
          </div>
        </form>;
      })()}

      {flow && <form className="account-settings-form" onSubmit={submitCode}>
        <h3>Xác minh {flow.channel === 'EMAIL' ? 'email' : 'số điện thoại'}</h3>
        <p>Mã có hiệu lực thêm {secondsToExpire} giây. Có thể yêu cầu mã khác sau {secondsToResend} giây.</p>
        <Input label="Mã OTP gồm 6 chữ số" type="text" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          required disabled={pending || secondsToExpire === 0} error={fieldError} />
        <div className="account-settings-actions">
          <Button type="submit" loading={pending} loadingLabel="Đang xác minh…" disabled={secondsToExpire === 0}>Xác minh và lưu</Button>
          <Button variant="secondary" disabled={pending || secondsToResend > 0}
            onClick={() => sendCode(flow.channel, flow.contact)}>
            {secondsToResend > 0 ? `Gửi lại sau ${secondsToResend} giây` : 'Gửi mã mới'}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={closeFlow}>Hủy</Button>
        </div>
      </form>}
    </section>

    <Notice state="info" title="Thông tin liên hệ được bảo vệ">
      Trang này chỉ đọc liên hệ thuộc phiên hiện tại và che một phần giá trị. Không thể tự gộp liên hệ đang thuộc tài khoản khác.
    </Notice>
  </section>;
}
