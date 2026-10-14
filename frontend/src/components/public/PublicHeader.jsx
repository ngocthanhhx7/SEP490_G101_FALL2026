import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../ui/BrandLogo.jsx';

const links = [
  ['Dịch vụ', '/services'],
  ['Khu vực & chính sách', '/service-areas'],
  ['Liên hệ', '/#contact'],
];

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return <header className="pwc-public-header">
    <div className="pwc-public-header-inner">
      <Link className="pwc-public-brand" to="/" onClick={closeMenu} aria-label="Paw World Care — Trang chủ">
        <BrandLogo alt="Paw World Care" />
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
        {links.map(([label, to]) => <Link key={label} to={to} onClick={closeMenu}>{label}</Link>)}
      </nav>
      <Link className="pwc-button pwc-button-primary pwc-header-cta" to="/sign-in" onClick={closeMenu}>
        Đặt dịch vụ
      </Link>
    </div>
  </header>;
}