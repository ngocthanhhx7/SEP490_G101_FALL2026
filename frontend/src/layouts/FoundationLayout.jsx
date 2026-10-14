import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

// Basic foundation only; P04/P48 own the final shared header, sidebar and avatar.
export function FoundationLayout() {
  const location = useLocation();
  const main = useRef(null);
  useEffect(() => { main.current?.focus(); }, [location.pathname]);
  return <div className="foundation-shell">
    <a className="skip-link" href="#main-content">Đến nội dung chính</a>
    <header className="foundation-header">
      <Link to="/" aria-label="Paw World Care — Trang chủ">
        <img src="/assets/logo/ngang.svg" width="190" alt="Paw World Care" />
      </Link>
      <nav aria-label="Điều hướng chính">
        <Link to="/">Trang chủ</Link><Link to="/account/settings">Tài khoản</Link>
      </nav>
    </header>
    <main id="main-content" tabIndex={-1} ref={main}><Outlet /></main>
    <footer>Chăm sóc chó và mèo tại nhà · Paw World Care</footer>
  </div>;
}
