import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';

const ROLE_LABELS = {
  CUSTOMER: 'Khách hàng', PET_SITTER: 'Pet sitter', STAFF: 'Nhân viên', ADMIN: 'Quản trị viên'
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('vi-VN') ?? '').join('') || 'PW';
}

export function AccountPage() {
  const session = useSession();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const user = session.user ?? {};
  const roles = Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean);

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
    <div className="account-overview-breadcrumb"><span>Trang cá nhân</span><span aria-hidden="true">/</span><strong>Tài khoản của bạn</strong></div>
    <header className="account-overview-heading">
      <span className="admin-eyebrow">THÔNG TIN CÁ NHÂN</span>
      <h1 id="account-overview-title">Tài khoản</h1>
      <p>Thông tin bên dưới thuộc về tài khoản đang đăng nhập.</p>
    </header>
    {logoutError && <Notice state="error" title="Chưa thể đăng xuất">{logoutError}</Notice>}
    <div className="account-overview-card">
      <div className="account-overview-person">
        <span className="admin-avatar account-overview-avatar" aria-hidden="true">{initials(user.displayName)}</span>
        <div><span className="admin-eyebrow">TÀI KHOẢN HIỆN TẠI</span>
          <h2>{user.displayName ?? 'Người dùng'}</h2>
          <span className="account-overview-active"><span aria-hidden="true" />Phiên đang hoạt động</span>
        </div>
      </div>
      <dl className="account-overview-fields">
        <div><dt>Họ và tên</dt><dd>{user.displayName ?? 'Chưa có thông tin'}</dd></div>
        <div><dt>Vai trò</dt><dd>{roles.length ? roles.map(role => ROLE_LABELS[role] ?? role).join(', ') : 'Chưa có thông tin'}</dd></div>
        <div><dt>Mã tài khoản</dt><dd className="admin-numeric">{user.id ? user.id.slice(-8).toUpperCase() : 'Chưa có thông tin'}</dd></div>
      </dl>
      <Notice state="info" title="Thông tin được bảo vệ">
        Trang này chỉ hiển thị thông tin tài khoản đang đăng nhập. Các thao tác cập nhật hồ sơ hoặc liên hệ cần luồng xác minh riêng.
      </Notice>
      <div className="account-overview-actions">
        {roles.includes('ADMIN') && <Link className="account-overview-link" to="/admin/users">Quản lý tài khoản người dùng</Link>}
        <Button variant="secondary" loading={logoutPending} loadingLabel="Đang đăng xuất…" onClick={logout}>Đăng xuất</Button>
      </div>
    </div>
  </section>;
}
