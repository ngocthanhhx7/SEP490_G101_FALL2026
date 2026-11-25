import { ProfileAvatar } from '../../components/common/ProfileAvatar.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { primaryRole, roleLabel } from '../../utils/role-access.js';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('vi-VN') ?? '').join('') || 'PW';
}

export function AccountPage() {
  const session = useSession();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const user = session.user ?? {};
  const role = primaryRole(user);

  async function logout() {
    setLogoutPending(true);
    setLogoutError('');
    try { await session.logout(); }
    catch (error) {
      setLogoutError(error?.code === 'LOGOUT_NOT_AVAILABLE'
        ? 'Đăng xuất sẽ khả dụng khi luồng phiên và CSRF được tích hợp.'
        : 'Chưa thể kết thúc phiên. Hãy thử lại sau.');
    } finally { setLogoutPending(false); }
  }

  return <section className="account-overview" aria-labelledby="account-overview-title">
    <header className="account-overview-heading">
      <h1 id="account-overview-title">Tài khoản</h1>
      <p>Thông tin bên dưới thuộc về tài khoản đang đăng nhập.</p>
    </header>
    {logoutError && <Notice state="error" title="Chưa thể đăng xuất">{logoutError}</Notice>}
    <div className="account-overview-card">
      <div className="account-overview-person">
        <ProfileAvatar fallback={initials(user.displayName)} className="account-overview-avatar" />
        <div>
          <h2>{user.displayName ?? 'Người dùng'}</h2>
          <span className="account-overview-active"><span aria-hidden="true" />Phiên đang hoạt động</span>
        </div>
      </div>
      <dl className="account-overview-fields">
        <div><dt>Vai trò</dt><dd>{roleLabel(role)}</dd></div>
        <div><dt>Mã tài khoản</dt><dd className="admin-numeric">{user.id ? user.id.slice(-8).toUpperCase() : 'Chưa có thông tin'}</dd></div>
      </dl>
      <div className="account-overview-actions">
        <Link className="account-overview-link" to="/account/profile">Chỉnh sửa hồ sơ</Link>
        <Link className="pwc-button pwc-button--secondary" to="/account/settings">Liên hệ &amp; bảo mật</Link>
        <Button variant="secondary" loading={logoutPending} loadingLabel="Đang đăng xuất…" onClick={logout}>Đăng xuất</Button>
      </div>
    </div>
  </section>;
}
