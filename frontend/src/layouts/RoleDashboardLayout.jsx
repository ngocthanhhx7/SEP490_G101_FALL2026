import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, useLocation, useOutlet } from 'react-router-dom';
import { AvatarMenu } from '../components/common/AvatarMenu.jsx';
import { Button } from '../components/ui/Button.jsx';
import { BrandLogo } from '../components/ui/BrandLogo.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { LayoutDashboard, Users, CalendarDays, Bell, Settings, UserRound, BriefcaseBusiness, MapPin, Wallet, ClipboardList, PawPrint, Menu, Building2, FileCheck } from 'lucide-react';
import { NotificationBell } from '../components/common/NotificationBell.jsx';
import { PublicHeader } from '../components/public/PublicHeader.jsx';
import { PublicFooter } from '../components/public/PublicFooter.jsx';
import '../styles/public-site.css';
import '../styles/workspaces.css';
import './role-dashboard-layout.css';
import './customer-account-layout.css';

function NavigationIcon({ to }) {
  const Icon = /notification/.test(to) ? Bell : /settings/.test(to) ? Settings : /users|sitters/.test(to) ? Users
    : /payroll|settlement/.test(to) ? Wallet : /services/.test(to) ? BriefcaseBusiness : /applications|profiles/.test(to) ? FileCheck
    : /dispatch|invitations/.test(to) ? ClipboardList : /availability|bookings/.test(to) ? CalendarDays
    : /areas|addresses/.test(to) ? MapPin : /pets/.test(to) ? PawPrint : /account|profile/.test(to) ? UserRound : LayoutDashboard;
  return <Icon size={18} aria-hidden="true" />;
}

const ROLE_CONFIG = Object.freeze({
  CUSTOMER: {
    label: 'Khách hàng',
    workspace: 'Khu vực khách hàng',
    navigation: 'Điều hướng khách hàng',
    allows: ['CUSTOMER'],
  },
  PET_SITTER: {
    label: 'Người chăm sóc',
    workspace: 'Khu vực người chăm sóc',
    navigation: 'Điều hướng người chăm sóc',
    allows: ['PET_SITTER'],
  },
  STAFF: {
    label: 'Nhân viên',
    workspace: 'Khu vực nhân viên',
    navigation: 'Điều hướng nhân viên',
    allows: ['STAFF', 'ADMIN'],
  },
  ADMIN: {
    label: 'Quản trị viên',
    workspace: 'Khu vực quản trị',
    navigation: 'Điều hướng quản trị',
    allows: ['ADMIN'],
  },
});

function StateScreen({ state, title, children, action }) {
  return <main className="pwc-role-shell-state">
    <Notice state={state} title={title} action={action}>{children}</Notice>
  </main>;
}

function getRoles(user) {
  if (Array.isArray(user?.roles)) return user.roles;
  return user?.role ? [user.role] : [];
}

export function RoleDashboardLayout({
  role,
  navigationItems = [],
  notificationTo,
  children,
}) {
  const session = useSession();
  const location = useLocation();
  const outlet = useOutlet();
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const mobileNavToggleRef = useRef(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 48rem)').matches
  ));
  const config = ROLE_CONFIG[role];
  const currentRoles = getRoles(session.user);
  const canEnter = config && config.allows.some((allowedRole) => currentRoles.includes(allowedRole));

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname, session.status]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 48rem)');
    const handleChange = (event) => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleChange);
    else mediaQuery.addListener?.(handleChange);
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', handleChange);
      else mediaQuery.removeListener?.(handleChange);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    sidebarRef.current?.focus();

    function handlePointerDown(event) {
      if (!sidebarRef.current?.contains(event.target)
        && !mobileNavToggleRef.current?.contains(event.target)) {
        setMobileNavOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileNavOpen(false);
        mobileNavToggleRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileNavOpen]);

  if (!config) {
    return <StateScreen state="forbidden" title="Khu vực không khả dụng">
      Vai trò này hiện không được hỗ trợ.
    </StateScreen>;
  }
  if (session.status === 'loading') {
    return <StateScreen state="loading" title="Đang kiểm tra phiên">Vui lòng chờ trong giây lát.</StateScreen>;
  }
  if (session.status === 'pending') {
    return <StateScreen state="pending" title="Đang chờ kết nối phiên">
      Khu vực tài khoản sẽ khả dụng sau khi đăng nhập được kết nối.
    </StateScreen>;
  }
  if (session.status === 'error') {
    return <StateScreen state="error" title="Không thể kiểm tra phiên"
      action={<Button onClick={session.refresh}>Thử lại</Button>}>
      Hãy thử lại sau khi kết nối phiên hoạt động trở lại.
    </StateScreen>;
  }
  if (session.status === 'guest') {
    return <Navigate to="/sign-in" replace
      state={{ from: location.pathname + location.search }} />;
  }
  if (session.status !== 'authenticated' || !session.user) {
    return <StateScreen state="error" title="Phiên không hợp lệ">
      Không thể mở khu vực tài khoản với dữ liệu phiên hiện tại.
    </StateScreen>;
  }
  if (!canEnter) {
    return <StateScreen state="forbidden" title="Bạn không có quyền truy cập">
      Tài khoản hiện tại không có vai trò phù hợp với khu vực này.
    </StateScreen>;
  }

  const safeNavigationItems = Array.isArray(navigationItems)
    ? navigationItems.filter((item) => typeof item?.label === 'string'
      && item.label.trim().length > 0 && typeof item?.to === 'string' && item.to.trim().length > 0)
    : [];
  const page = children ?? outlet;

  if (role === 'CUSTOMER') return <div className="pwc-public-root pwc-customer-account">
    <a className="pwc-role-shell__skip" href="#pwc-role-main">Đến nội dung chính</a>
    <PublicHeader notificationTo={notificationTo} />
    <div className="pwc-customer-account__body">
      <aside ref={sidebarRef} tabIndex={-1} className="pwc-customer-account__sidebar" aria-label="Tài khoản khách hàng">
        <div className="pwc-customer-account__identity">
          <span className="pwc-customer-account__avatar" aria-hidden="true">{session.user.displayName?.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase() || 'PW'}</span>
          <div><strong>{session.user.displayName}</strong><Link to="/account/profile">Hồ sơ của tôi</Link></div>
        </div>
        <button ref={mobileNavToggleRef} className="pwc-customer-account__toggle" type="button" aria-expanded={mobileNavOpen}
          aria-controls="pwc-customer-navigation" onClick={() => setMobileNavOpen(open => !open)}>
          <Menu size={18} aria-hidden="true" />Menu tài khoản<span aria-hidden="true">{mobileNavOpen ? '−' : '+'}</span>
        </button>
        <nav id="pwc-customer-navigation" className="pwc-customer-account__navigation" data-open={mobileNavOpen}
          inert={isMobile && !mobileNavOpen ? true : undefined} aria-hidden={isMobile && !mobileNavOpen ? 'true' : undefined}
          aria-label={config.navigation}>
          {[...new Set(safeNavigationItems.map(item => item.group || 'Tài khoản của tôi'))].map(group => <div className="pwc-customer-account__group" key={group}>
            <h2>{group}</h2>{safeNavigationItems.filter(item => (item.group || 'Tài khoản của tôi') === group).map(item =>
              <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileNavOpen(false)}><NavigationIcon to={item.to} />{item.label}</NavLink>)}
          </div>)}
        </nav>
      </aside>
      <main id="pwc-role-main" className="pwc-customer-account__main" ref={mainRef} tabIndex={-1}>{page || <Notice state="empty" title="Chưa có trang trong khu vực này" />}</main>
    </div>
    <PublicFooter />
  </div>;

  return <div className="pwc-role-shell pwc-workspace-shell">
    <a className="pwc-role-shell__skip" href="#pwc-role-main">Đến nội dung chính</a>
    <header className="pwc-role-shell__header">
      <Link to="/" className="pwc-role-shell__brand" aria-label="Paw World Care — Trang chủ">
        <BrandLogo />
      </Link>
      <div className="pwc-role-shell__header-actions">
        <NotificationBell to={notificationTo} />
        <button ref={mobileNavToggleRef} className="pwc-role-shell__mobile-nav-toggle"
          type="button" aria-expanded={mobileNavOpen} aria-controls="pwc-role-sidebar"
          onClick={() => setMobileNavOpen((open) => !open)}>
          <Menu size={20} aria-hidden="true" />
          <span className="workspace-sr-only">{mobileNavOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}</span>
        </button>
        <AvatarMenu user={session.user} role={role} onLogout={session.logout}
          notificationTo={notificationTo} />
      </div>
    </header>

    <div className="pwc-role-shell__body">
      {mobileNavOpen && <button className="pwc-role-shell__drawer-backdrop" type="button"
        tabIndex={-1} aria-label="Đóng lớp phủ điều hướng"
        onClick={() => {
          setMobileNavOpen(false);
          mobileNavToggleRef.current?.focus();
        }} />}
      <aside id="pwc-role-sidebar" ref={sidebarRef} tabIndex={-1}
        className="pwc-role-shell__sidebar" data-open={mobileNavOpen}
        inert={isMobile && !mobileNavOpen ? true : undefined}
        aria-hidden={isMobile && !mobileNavOpen ? 'true' : undefined}
        aria-label={config.navigation + ' — thanh bên'}>
        <h2 className="pwc-role-shell__sidebar-title"><Building2 size={15} aria-hidden="true" />{config.label}</h2>
        {safeNavigationItems.length > 0
          ? <nav className="pwc-role-shell__navigation" aria-label={config.navigation}>
            {[...new Set(safeNavigationItems.map(item => item.group || 'Điều hướng'))].map(group => <section className="pwc-role-shell__nav-group" key={group}>
              <h3>{group}</h3>
              {safeNavigationItems.filter(item => (item.group || 'Điều hướng') === group).map((item) => <NavLink key={item.key ?? item.to}
              to={item.to} end={item.end} className={({ isActive }) =>
                'pwc-role-shell__nav-link' + (isActive ? ' is-active' : '')}
              onClick={() => setMobileNavOpen(false)}>
              <NavigationIcon to={item.to} />{item.label}
            </NavLink>)}
            </section>)}
          </nav>
          : <p className="pwc-role-shell__navigation-empty" role="status">
            Chưa có trang điều hướng trong khu vực này.
          </p>}
      </aside>

      <main id="pwc-role-main" className="pwc-role-shell__main" tabIndex={-1} ref={mainRef}>
        {page || <Notice state="empty" title="Chưa có trang trong khu vực này">
          Trang phù hợp sẽ xuất hiện tại đây khi khả dụng.
        </Notice>}
      </main>
    </div>
    <footer className="pwc-role-shell__footer">
      Paw World Care <span aria-hidden="true">·</span> {config.label}
    </footer>
  </div>;
}

export function CustomerDashboardLayout(props) {
  return <RoleDashboardLayout {...props} role="CUSTOMER" />;
}

export function SitterDashboardLayout(props) {
  return <RoleDashboardLayout {...props} role="PET_SITTER" />;
}

export function StaffDashboardLayout(props) {
  return <RoleDashboardLayout {...props} role="STAFF" />;
}

export function AdminDashboardLayout(props) {
  return <RoleDashboardLayout {...props} role="ADMIN" />;
}
