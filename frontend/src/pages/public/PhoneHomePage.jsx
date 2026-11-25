import { Link } from 'react-router-dom';
import { ArrowDownToLine, ChevronRight, FileText, LifeBuoy, LogIn, MapPin, ShoppingBag } from 'lucide-react';
import { useInstallGuideOffer } from '../../hooks/useWebAppInstall.js';
import { MobileServiceChoices } from './MobileServiceChoices.jsx';
import { CareHomeBanner } from '../../components/common/CareHomeBanner.jsx';

export function PhoneHomePage({ loadCatalog }) {
  const showInstallGuide = useInstallGuideOffer();

  return <div className="pwc-phone-home">
    <CareHomeBanner title="Chăm bé theo lịch của bạn" supporting="Chăm tại nhà, đi dạo và các dịch vụ dành cho chó mèo." />
    <MobileServiceChoices loadCatalog={loadCatalog} />

    <div className="pwc-phone-home__secondary">
      <Link className="pwc-phone-home__row" to="/service-areas">
        <MapPin size={20} aria-hidden="true" />
        <span>Kiểm tra khu vực phục vụ</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
      <p className="pwc-phone-home__resume">
        <span>Đã có lịch hẹn?</span>
        <Link className="pwc-phone-home__button pwc-phone-home__button--resume" to="/sign-in" state={{ from: '/account/bookings' }}>
          <LogIn size={17} aria-hidden="true" /> Đăng nhập để theo dõi
        </Link>
      </p>
      <Link className="pwc-phone-home__row" to="/products">
        <ShoppingBag size={20} aria-hidden="true" />
        <span><strong>Đồ dùng cho bé</strong><small>Thức ăn và phụ kiện</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </div>

    <nav className="pwc-phone-home__support" aria-label="Hỗ trợ và chính sách">
      <Link className="pwc-phone-home__button" to="/contact" state={{ helpFrom: '/' }}><LifeBuoy size={17} aria-hidden="true" /> Hỗ trợ</Link>
      <Link className="pwc-phone-home__button" to="/policies" state={{ policyFrom: '/' }}><FileText size={17} aria-hidden="true" /> Chính sách</Link>
      {showInstallGuide && <Link className="pwc-phone-home__button" to="/install">
        <ArrowDownToLine size={17} aria-hidden="true" /> Cài ứng dụng
      </Link>}
    </nav>
  </div>;
}
