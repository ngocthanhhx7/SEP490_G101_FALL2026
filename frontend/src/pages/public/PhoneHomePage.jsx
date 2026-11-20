import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, PawPrint, ShoppingBag, UserRound } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import './phone-home.css';

export function PhoneHomePage() {
  const { status } = useSession();
  const signedIn = status === 'authenticated';

  return <section className="pwc-phone-home" aria-labelledby="pwc-phone-home-title">
    <div className="pwc-phone-home__hero">
      <div>
        <h1 id="pwc-phone-home-title">Bé cần chăm sóc gì?</h1>
        <p>Chọn dịch vụ và đặt lịch cho bé.</p>
        <Link to="/services" className="pwc-phone-home__primary">Chọn dịch vụ <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
      <img src="/assets/figma-public/home-Image656.webp" alt="" fetchPriority="high" />
    </div>

    <section className="pwc-phone-home__section" aria-labelledby="pwc-phone-shortcuts-title">
      <h2 id="pwc-phone-shortcuts-title">Truy cập nhanh</h2>
      <div className="pwc-phone-home__shortcuts">
        {signedIn ? <>
          <Link to="/account/bookings"><CalendarDays aria-hidden="true" /> Lịch của tôi</Link>
          <Link to="/account/pets"><PawPrint aria-hidden="true" /> Thú cưng</Link>
        </> : <>
          <Link to="/sign-in"><UserRound aria-hidden="true" /> Đăng nhập</Link>
          <Link to="/register"><PawPrint aria-hidden="true" /> Tạo tài khoản</Link>
        </>}
        <Link to="/products"><ShoppingBag aria-hidden="true" /> Cửa hàng</Link>
      </div>
    </section>

    <nav className="pwc-phone-home__support" aria-label="Hỗ trợ và chính sách">
      <Link to="/contact">Hỗ trợ</Link>
      <Link to="/policies">Chính sách</Link>
      <Link to="/install">Cài ứng dụng</Link>
    </nav>
  </section>;
}
