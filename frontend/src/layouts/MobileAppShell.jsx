import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, CalendarDays, ClipboardList, House, PawPrint, ShoppingBag, UserRound, Wallet } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { SiteBrandMark } from '../components/ui/SiteBrandMark.jsx';
import { primaryRole } from '../utils/role-access.js';
import './phone-app-shell.css';

const service = ['services', 'Dịch vụ', '/services', PawPrint];
const account = ['account', 'Tài khoản', '/account', UserRound];
const guest = [['home', 'Trang chủ', '/', House], service,
  ['shop', 'Cửa hàng', '/products', ShoppingBag], ['account', 'Tài khoản', '/sign-in', UserRound]];
const customer = [['home', 'Trang chủ', '/customer', House], service,
  ['bookings', 'Lịch hẹn', '/account/bookings', CalendarDays], ['pets', 'Thú cưng', '/account/pets', PawPrint], account];
const sitter = [['home', 'Hôm nay', '/sitter', House], ['schedule', 'Ca làm', '/sitter/schedule', CalendarDays],
  ['offers', 'Lời mời', '/sitter/invitations', ClipboardList], ['income', 'Thu nhập', '/sitter/payroll', Wallet], account];

function stableTab(route, role, source, tabs) {
  if (route?.id === 'M03') return tabs.some(([key]) => key === source) ? source : 'account';
  if (route?.tab === 'shop' && role === 'CUSTOMER') return 'account';
  return tabs.some(([key]) => key === route?.tab) ? route.tab : 'account';
}

export function MobileAppShell({ route, children }) {
  const session = useSession();
  const { unreadCount } = useNotifications();
  const { pathname, hash, state } = useLocation();
  const navigationType = useNavigationType();
  const [incoming, setIncoming] = useState(null);
  const enabled = Boolean(route);
  const role = primaryRole(session.user);
  const tabs = role === 'CUSTOMER' ? customer : role === 'PET_SITTER' ? sitter : guest;
  const active = stableTab(route, role, state?.mobileTab, tabs);
  const parent = route?.id === 'M09' ? '/account/pets' : route?.id === 'M13' || route?.id === 'M14'
    ? pathname.split('/').slice(0, 4).join('/') : route?.id === 'M49' || route?.id === 'M50' ? '/policies'
      : route?.id === 'M41' ? '/customer/cart' : tabs.find(([key]) => key === active)?.[2] ?? '/';
  const fallback = parent === pathname ? tabs[0][2] : parent;
  const source = state?.mobileBack;
  const fromSitterSchedule = route?.id === 'N02' && typeof source === 'string'
    && /^\/sitter(?:\/(?:schedule(?:\?[^#]*)?|invitations))?$/.test(source);
  const fromCustomerAgenda = route?.id === 'M13' && typeof source === 'string'
    && /^\/account\/bookings(?:\?[^#]*)?$/.test(source);
  const fromOrderList = route?.id === 'M11' && typeof source === 'string'
    && /^\/customer\/product-orders(?:\?page=\d+)?$/.test(source);
  const fromHelp = state?.helpFrom;
  const helpBack = route?.id === 'M33' && typeof fromHelp === 'string'
    && /^(?:\/(?:customer\/product-orders|account\/bookings\/[a-f0-9]{24}|sitter\/visits\/[a-f0-9]{24}|policies(?:\/[a-z0-9._-]{1,80}){0,2})(?:\?[^#]*)?|\/)$/i.test(fromHelp);
  const fromPolicy = state?.policyFrom;
  const policyBack = ['M48', 'M49', 'M50'].includes(route?.id) && typeof fromPolicy === 'string'
    && /^\/(?:account|(?:contact|policies)(?:\?[^#]*)?)?$/.test(fromPolicy) && fromPolicy !== pathname;
  const back = helpBack ? fromHelp : policyBack ? fromPolicy : fromSitterSchedule || fromCustomerAgenda || fromOrderList
    ? source : !role && ['M33','M48'].includes(route?.id) ? '/' : fallback;
  const showTabs = enabled && route.kind !== 'task';
  const count = Number.isInteger(unreadCount) && unreadCount > 0 ? unreadCount : 0;

  useEffect(() => {
    if (enabled && !hash && navigationType !== 'POP') window.scrollTo(0, 0);
  }, [enabled, pathname, hash, navigationType]);

  useEffect(() => {
    const workers = window.navigator.serviceWorker;
    const accept = event => {
      if (event.data?.type !== 'PWC_NOTIFICATION_CLICK') return;
      const id = event.data.notificationId;
      setIncoming(typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? '?open=' + id : '');
    };
    workers?.addEventListener('message', accept);
    return () => workers?.removeEventListener('message', accept);
  }, []);

  return <div className={enabled ? 'pwc-phone-app' : 'pwc-phone-app-pass-through'} data-tabs={showTabs || undefined} data-route={route?.id}>
    {enabled && <header className="pwc-mobile-header">
      {route.kind !== 'root' && <Link to={back} replace aria-label="Quay lại"><ArrowLeft aria-hidden="true" /></Link>}
      {route.id === 'M31' || route.id === 'M04' ? <SiteBrandMark /> : <strong>{route.title}</strong>}
      {role && route.id !== 'M03' && <Link className="pwc-mobile-header__bell" to="/account/notifications"
        state={{ mobileTab: active }} aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}>
        <Bell aria-hidden="true" />{count > 0 && <span aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </Link>}
    </header>}
    {session.revalidation === 'checking' && <p className="pwc-mobile-session" role="status">Đang kiểm tra phiên…</p>}
    {session.revalidation === 'error' && <p className="pwc-mobile-session" role="alert">
      Chưa xác minh lại phiên. Nội dung đang nhập vẫn được giữ. <button onClick={session.revalidate}>Thử lại</button>
    </p>}
    {incoming !== null && <aside className="pwc-mobile-session" role="status">
      <Link to={'/account/notifications' + incoming} onClick={() => setIncoming(null)}>Mở thông báo</Link>
      <button type="button" onClick={() => setIncoming(null)}>Để sau</button>
    </aside>}
    {children}
    {showTabs && <nav className="pwc-phone-tabs" aria-label="Điều hướng ứng dụng"
      style={{ '--pwc-tab-count': tabs.length }}>
      {tabs.map(([key, label, to, Icon]) => <Link key={key} to={to} aria-current={key === active ? 'page' : undefined}>
        <span className="pwc-phone-tabs__icon"><Icon size={21} aria-hidden="true" /></span>
        <span>{label}</span>
      </Link>)}
    </nav>}
  </div>;
}
