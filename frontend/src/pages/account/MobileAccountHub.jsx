import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight, FileText, LifeBuoy, LogOut, MapPin, Package, ShieldCheck, ShoppingBag, ShoppingCart, UserRound } from 'lucide-react';
import { ProfileAvatar } from '../../components/common/ProfileAvatar.jsx';
import { useInstallGuideOffer } from '../../hooks/useWebAppInstall.js';

const personal = ['Thông tin cá nhân', '/account/profile', UserRound, 'Tên, ngày sinh, giới tính'];
const notifications = ['Thông báo', '/account/notifications', Bell, 'Cập nhật cho bạn'];
const common = [['Liên hệ & bảo mật', '/account/settings', ShieldCheck], ['Hỗ trợ', '/contact', LifeBuoy], ['Chính sách', '/policies', FileText]];
const customer = [
  ['Cửa hàng', '/products', ShoppingBag], ['Giỏ hàng', '/customer/cart', ShoppingCart],
  ['Hồ sơ ứng tuyển', '/sitter/application-status', FileText]];
const sitter = [['Hồ sơ Pet Sitter', '/sitter/profile'], ['Hồ sơ công khai', '/sitter/public-profile'],
  ['Khu vực làm việc', '/sitter/work-areas'], ['Giờ nhận việc', '/sitter/availability'], ['Sự cố', '/incidents']];

export function MobileAccountHub({ role, user, logout }) {
  const [busy, setBusy] = useState(false);
  const showInstallGuide = useInstallGuideOffer();
  const [error, setError] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(false);
    try { await logout(); } catch { setError(true); }
    finally { setBusy(false); }
  }
  const isCustomer = role === 'CUSTOMER';
  const cards = isCustomer ? [personal, ['Địa chỉ', '/account/addresses', MapPin, 'Nơi chăm sóc bé'],
    ['Đơn mua hàng', '/customer/product-orders', Package, 'Theo dõi đơn của bạn'], notifications] : [personal, notifications];
  const initials = user?.displayName?.trim().split(/\s+/u).slice(-2).map(part => Array.from(part)[0]).join('').toUpperCase() || 'PW';
  const secondary = common.filter(([, to]) => isCustomer || to !== '/contact');
  const more = [...(isCustomer ? customer : sitter), ...(showInstallGuide ? [['Cài ứng dụng', '/install']] : [])];
  return <section className="pwc-mobile-screen pwc-mobile-account">
    <h1 className="workspace-sr-only">Tài khoản</h1>
    <div className="pwc-mobile-account__identity">
      <ProfileAvatar fallback={initials} />
      <div><strong>{user?.displayName}</strong><span>{isCustomer ? 'Khách hàng' : 'Pet Sitter'}</span></div>
    </div>
    <ul className="pwc-mobile-account__cards">
      {cards.map(([label, to, Icon, detail]) => <li key={to}><Link to={to}>
        <Icon size={20} aria-hidden="true" /><strong>{label}</strong><small>{detail}</small>
      </Link></li>)}
    </ul>
    <ul className="pwc-mobile-account__links">
      {secondary.map(([label, to, Icon = ChevronRight]) => <li key={to}><Link to={to}>
        <Icon size={18} aria-hidden="true" /><span>{label}</span><ChevronRight size={16} aria-hidden="true" />
      </Link></li>)}
    </ul>
    {error && <p role="alert">Chưa đăng xuất được. Hãy thử lại.</p>}
    <button className="pwc-mobile-account__logout" type="button" onClick={signOut} disabled={busy}><LogOut size={18} aria-hidden="true" />Đăng xuất</button>
    <details className="pwc-mobile-account__more">
      <summary>{isCustomer ? 'Mua sắm và hồ sơ ứng tuyển' : 'Hồ sơ và thiết lập công việc'}</summary>
      <ul className="pwc-mobile-account__links">
        {more.map(([label, to, Icon]) => <li key={to}><Link to={to}>
          {Icon ? <Icon size={18} aria-hidden="true" /> : <span aria-hidden="true" />}
          <span>{label}</span><ChevronRight size={16} aria-hidden="true" />
        </Link></li>)}
      </ul>
    </details>
  </section>;
}
