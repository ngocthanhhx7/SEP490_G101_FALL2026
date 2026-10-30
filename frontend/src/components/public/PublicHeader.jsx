import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { AvatarMenu } from '../common/AvatarMenu.jsx';
import { NotificationBell } from '../common/NotificationBell.jsx';

const links = [
  ['Trang chủ', '/'],
  ['Câu truyện', '/#stories'],
  ['Dịch vụ', '/services'],
  ['Về chúng tôi', '/about'],
  ['Liên hệ', '/contact'],
];

export function PublicHeader({ notificationTo } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef(null);
  const searchTrigger = useRef(null);
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const roles = session.user?.roles ?? [session.user?.role];
  const role = ['ADMIN', 'STAFF', 'PET_SITTER', 'CUSTOMER'].find(value => roles.includes(value));
  useEffect(() => { setMenuOpen(false); setSearchOpen(false); }, [location.key]);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return <header className="pwc-public-header">
    <div className="pwc-public-header-inner">
      <Link className="pwc-public-brand" to="/" onClick={closeMenu} aria-label="Paw World Care — Trang chủ">
        <img src="/assets/figma-public/header-Vector.svg" alt="Paw World Care" /><span>PawWorld<span className="pwc-brand-care">Care</span></span>
      </Link>
      <button
        className="pwc-menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="pwc-public-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? 'Đóng menu' : 'Mở menu'}
      </button>
      <nav
        className={'pwc-public-navigation' + (menuOpen ? ' is-open' : '')}
        id="pwc-public-navigation"
        aria-label="Điều hướng chính"
      >
        {links.map(([label, to]) => <Link key={label} to={to} onClick={closeMenu}
          aria-current={location.pathname === to && !location.hash ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <div className="pwc-header-actions">
        {notificationTo && session.status === 'authenticated' && <NotificationBell to={notificationTo} />}
        {session.status === 'authenticated'
          ? <AvatarMenu user={session.user} role={role} iconOnly customerNavigation={role === 'CUSTOMER'}
              notificationTo={role === 'CUSTOMER' ? '/account/notifications' : undefined}
              onLogout={async () => { await session.logout(); navigate('/', { replace: true }); }} />
          : <><Link className="pwc-auth-login" to="/sign-in" onClick={closeMenu}>Đăng nhập</Link>
              <Link className="pwc-auth-register" to="/register" onClick={closeMenu}>Đăng ký</Link></>}
        <button type="button" className="pwc-search-toggle" ref={searchTrigger} aria-label="Tìm kiếm dịch vụ"
          aria-expanded={searchOpen} aria-controls="pwc-header-search" onClick={() => setSearchOpen(value => !value)}>
          <img src="/assets/figma-public/header-Container1.svg" alt="" />
        </button>
      </div>
    </div>
    {searchOpen && <form className="pwc-header-search" id="pwc-header-search" role="search"
      onKeyDown={event => { if (event.key === 'Escape') { setSearchOpen(false); searchTrigger.current?.focus(); } }}
      onSubmit={event => { event.preventDefault(); navigate('/services?q=' + encodeURIComponent(query.trim())); }}>
      <label htmlFor="pwc-site-search">Tìm dịch vụ cho bé</label>
      <input id="pwc-site-search" ref={searchInput} type="search" maxLength={120} value={query}
        onChange={event => setQuery(event.target.value)} placeholder="Dắt chó đi dạo, chăm sóc mèo…" />
      <button className="pwc-button pwc-button-primary" type="submit">Tìm kiếm</button>
    </form>}
  </header>;
}
