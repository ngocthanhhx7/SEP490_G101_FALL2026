import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, CalendarDays, ClipboardList, HeartHandshake, House, PawPrint, ShoppingBag, UserRound, Wallet } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { SiteBrandMark } from '../components/ui/SiteBrandMark.jsx';
import { primaryRole } from '../utils/role-access.js';
import './phone-app-shell.css';

const service = ['services', 'Dịch vụ', '/services', HeartHandshake];
const account = ['account', 'Tài khoản', '/account', UserRound];
const guest = [['home', 'Trang chủ', '/', House], service,
  ['shop', 'Cửa hàng', '/products', ShoppingBag], ['account', 'Tài khoản', '/sign-in', UserRound]];
const customer = [['home', 'Trang chủ', '/customer', House], service,
  ['bookings', 'Lịch hẹn', '/account/bookings', CalendarDays], ['pets', 'Thú cưng', '/account/pets', PawPrint], account];
const sitter = [['home', 'Hôm nay', '/sitter', House], ['schedule', 'Ca làm', '/sitter/schedule', CalendarDays],
  ['offers', 'Lời mời', '/sitter/invitations', ClipboardList], ['income', 'Thu nhập', '/sitter/payroll', Wallet], account];

const backRoutes = {
  M05: '/services', M09: '/account/pets', M12: '/account/bookings', M15: '/account/bookings',
  M16: '/services', M20: '/sitter/payroll', M21: '/sitter/payroll', M22: '/sitter/schedule',
  M23: '/sitter/payroll', M28: '/incidents', M29: '/account', M35: '/services',
  M37: '/services', M39: '/products', M40: '/products', M41: '/customer/cart', M44: '/sign-in',
  M49: '/policies', M50: '/policies', N02: '/sitter/schedule'
};

function notificationBack(from, role, lookupRoute) {
  if (typeof from !== 'string' || !/^\/[a-z0-9/-]*(?:\?[^#]*)?$/i.test(from) || from.startsWith('//')) return false;
  const target = lookupRoute?.(from.split('?')[0], role);
  return target && target.id !== 'M03' && target.id !== 'M47' && target.kind !== 'task' && target.roles.includes(role);
}

function stableTab(route, role, source, tabs) {
  if (route?.id === 'M03') return tabs.some(([key]) => key === source) ? source : 'account';
  if (route?.tab === 'shop' && role === 'CUSTOMER') return 'account';
  return tabs.some(([key]) => key === route?.tab) ? route.tab : 'account';
}

export function MobileAppShell({ route, children, lookupRoute }) {
  const session = useSession();
  const { unreadCount } = useNotifications();
  const { pathname, search, hash, state } = useLocation();
  const navigationType = useNavigationType();
  const [incoming, setIncoming] = useState(null);
  const [keyboard, setKeyboard] = useState(false);
  const enabled = Boolean(route);
  const role = primaryRole(session.user);
  const tabs = role === 'CUSTOMER' ? customer : role === 'PET_SITTER' ? sitter : guest;
  const active = stableTab(route, role, state?.mobileTab, tabs);
  const home = role === 'PET_SITTER' ? '/sitter' : role === 'CUSTOMER' ? '/customer' : '/';
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const serviceBooking = route?.id === 'M36' && /^\/booking\/([a-f0-9]{24})$/i.exec(path);
  const parent = route?.id === 'M36' ? (serviceBooking ? '/services/' + serviceBooking[1] : '/services')
    : ['M13', 'M14'].includes(route?.id) ? pathname.split('/').slice(0, 4).join('/')
    : backRoutes[route?.id] ?? (role && !['M30', 'M43'].includes(route?.id) ? '/account' : home);
  const fallback = parent === path ? home : parent;
  const source = state?.mobileBack;
  const fromSitterSchedule = route?.id === 'N02' && typeof source === 'string'
    && /^\/sitter(?:\/(?:schedule(?:\?[^#]*)?|invitations))?$/.test(source);
  const fromSitterSettings = role === 'PET_SITTER' && ['M22', 'M25'].includes(route?.id)
    && typeof source === 'string' && /^\/(?:account|sitter(?:\/schedule(?:\?[^#]*)?)?)$/.test(source);
  const fromSitterPublicProfile = role === 'PET_SITTER' && route?.id === 'M18' && source === '/sitter/public-profile';
  const fromCustomerAgenda = ['M12', 'M13'].includes(route?.id) && typeof source === 'string'
    && /^\/account\/bookings(?:\?[^#]*)?$/.test(source);
  const orderQuery = new globalThis.URLSearchParams(search);
  const orderPage = orderQuery.get('page');
  const orderDetail = route?.id === 'M11' && /^[a-f0-9]{24}$/i.test(orderQuery.get('order') ?? '');
  const fromOrderList = orderDetail && typeof source === 'string'
    && /^\/customer\/product-orders(?:\?page=[1-9]\d*)?$/.test(source);
  const fromNotificationLink = route?.id === 'M03' && notificationBack(source, role, lookupRoute);
  const candidate = fromSitterSchedule || fromSitterSettings || fromSitterPublicProfile || fromCustomerAgenda || fromOrderList || fromNotificationLink ? source
    : orderDetail ? pathname + (/^[1-9]\d*$/.test(orderPage ?? '') ? '?page=' + orderPage : '') : fallback;
  const queryIndex = candidate.indexOf('?');
  const candidatePath = queryIndex === -1 ? candidate : candidate.slice(0, queryIndex);
  const candidateSearch = queryIndex === -1 ? '' : candidate.slice(queryIndex);
  const candidateIsCurrent = (candidatePath.replace(/\/+$/, '').toLowerCase() || '/') === path
    && candidateSearch === search;
  const back = candidateIsCurrent ? (fallback === path ? null : fallback) : candidate;
  const showTabs = enabled && route.kind !== 'task';
  const count = Number.isInteger(unreadCount) && unreadCount > 0 ? unreadCount : 0;

  useEffect(() => {
    if (enabled && !hash && navigationType !== 'POP') window.scrollTo(0, 0);
  }, [enabled, pathname, hash, navigationType]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return;
    const update = () => setKeyboard(window.innerHeight - viewport.height > 120 && viewport.scale === 1);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, [enabled]);

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

  return <div className={enabled ? 'pwc-phone-app' : 'pwc-phone-app-pass-through'} data-tabs={showTabs || undefined} data-route={route?.id} data-keyboard={keyboard || undefined}>
    {enabled && <header className="pwc-mobile-header">
      {back && route.kind !== 'root' && <Link to={back} replace aria-label="Quay lại"><ArrowLeft aria-hidden="true" /></Link>}
      {route.id === 'M31' || route.id === 'M04' ? <SiteBrandMark /> : <strong>{orderDetail ? 'Chi tiết đơn mua' : route.id === 'M10' && orderQuery.get('view') === 'orders' ? 'Đơn chăm sóc' : route.title}</strong>}
      {role && route.id !== 'M03' && <Link className="pwc-mobile-header__bell" to="/account/notifications"
        state={{ mobileTab: active, mobileBack: pathname + search }} aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}>
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
    <div className={enabled ? 'pwc-phone-content' : undefined}>{children}</div>
    {showTabs && <nav className="pwc-phone-tabs" aria-label="Điều hướng ứng dụng"
      style={{ '--pwc-tab-count': tabs.length }}>
      {tabs.map(([key, label, to, Icon]) => <Link key={key} to={to} aria-current={key === active ? 'page' : undefined}>
        <span className="pwc-phone-tabs__icon"><Icon size={21} aria-hidden="true" /></span>
        <span>{label}</span>
      </Link>)}
    </nav>}
  </div>;
}
