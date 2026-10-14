import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext.jsx';

// Basic foundation only; P04/P48 own the final shared header, sidebar and avatar.
export function FoundationLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const main = useRef(null);
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => { main.current?.focus(); }, [location.pathname]);
  async function handleLogout() {
    setLogoutError(false);
    try {
      await session.logout();
      navigate('/sign-in', { replace: true });
    } catch { setLogoutError(true); }
  }
  return <div className="foundation-shell">
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    <header className="foundation-header">
      <Link to="/" aria-label="Paw World Care — Trang chủ">
        <img src="/assets/logo/ngang.svg" width="190" alt="Paw World Care" />
      </Link>
      <nav aria-label="Điều hướng chính">
        <Link to="/">Trang chủ</Link><Link to="/account">Tài khoản</Link>
        {session.status === 'authenticated' ? <>
          <span>{session.user.displayName}</span>
          <button type="button" onClick={handleLogout}>Đăng xuất</button>
        </> : <Link to="/sign-in">Đăng nhập</Link>}
      </nav>
    </header>
    {logoutError && <p role="alert">Không thể đăng xuất lúc này. Phiên vẫn được giữ để bảo đảm máy chủ thu hồi thành công.</p>}
    <main id="main-content" tabIndex={-1} ref={main}><Outlet /></main>
    <footer>Chăm sóc chó và mèo tại nhà · Paw World Care</footer>
  </div>;
}
