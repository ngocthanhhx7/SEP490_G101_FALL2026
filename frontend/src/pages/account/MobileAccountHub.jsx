import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInstallGuideOffer } from '../../hooks/useWebAppInstall.js';

const common = [['Thông báo', '/account/notifications'], ['Cài đặt tài khoản', '/account/settings'], ['Chính sách', '/policies']];
const customer = [['Hồ sơ của tôi', '/account/profile'], ['Địa chỉ', '/account/addresses'],
  ['Cửa hàng', '/products'], ['Đơn mua hàng', '/customer/product-orders'], ['Giỏ hàng', '/customer/cart'],
  ['Hồ sơ ứng tuyển', '/sitter/application-status'], ['Hỗ trợ', '/contact']];
const sitter = [['Hồ sơ Pet Sitter', '/sitter/profile'], ['Hồ sơ công khai', '/sitter/public-profile'],
  ['Khu vực làm việc', '/sitter/work-areas'], ['Giờ nhận việc', '/sitter/availability'], ['Sự cố', '/incidents'], ['Hỗ trợ', '/contact']];

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
  return <section className="pwc-mobile-screen">
    <h1>Tài khoản</h1>
    <p>{user?.displayName}</p>
    <ul className="pwc-mobile-rows">
      {[...common, ...(role === 'CUSTOMER' ? customer : sitter)].map(([label, to]) =>
        <li key={to}><Link to={to}>{label}</Link></li>)}
      {showInstallGuide && <li><Link to="/install">Cài ứng dụng</Link></li>}
    </ul>
    {error && <p role="alert">Chưa đăng xuất được. Hãy thử lại.</p>}
    <button type="button" onClick={signOut} disabled={busy}>Đăng xuất</button>
  </section>;
}
