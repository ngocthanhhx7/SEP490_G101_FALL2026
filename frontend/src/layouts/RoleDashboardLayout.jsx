import { useEffect, useRef } from 'react';
import { Link, Navigate, NavLink, useLocation, useOutlet } from 'react-router-dom';
import { AvatarMenu } from '../components/common/AvatarMenu.jsx';
import { Button } from '../components/ui/Button.jsx';
import { BrandLogo } from '../components/ui/BrandLogo.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import './role-dashboard-layout.css';

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
  const config = ROLE_CONFIG[role];
  const currentRoles = getRoles(session.user);
  const canEnter = config && config.allows.some((allowedRole) => currentRoles.includes(allowedRole));

  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname, session.status]);

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

  return <div className="pwc-role-shell">
    <a className="pwc-role-shell__skip" href="#pwc-role-main">Đến nội dung chính</a>
    <header className="pwc-role-shell__header">
      <Link to="/" className="pwc-role-shell__brand" aria-label="Paw World Care — Trang chủ">
        <BrandLogo />
      </Link>
      <p className="pwc-role-shell__workspace">{config.workspace}</p>
      <AvatarMenu user={session.user} role={role} onLogout={session.logout}
        notificationTo={notificationTo} />
    </header>

    <div className="pwc-role-shell__body">
      <aside className="pwc-role-shell__sidebar" aria-label={config.navigation + ' — thanh bên'}>
        <h2 className="pwc-role-shell__sidebar-title">{config.label}</h2>
        {safeNavigationItems.length > 0
          ? <nav className="pwc-role-shell__navigation" aria-label={config.navigation}>
            {safeNavigationItems.map((item) => <NavLink key={item.key ?? item.to}
              to={item.to} end={item.end} className={({ isActive }) =>
                'pwc-role-shell__nav-link' + (isActive ? ' is-active' : '')}>
              {item.label}
            </NavLink>)}
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
