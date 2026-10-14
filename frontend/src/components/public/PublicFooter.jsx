import { Link } from 'react-router-dom';
import { BrandLogo } from '../ui/BrandLogo.jsx';

export function PublicFooter() {
  return <footer className="pwc-public-footer">
    <div className="pwc-public-footer-inner">
      <div>
        <Link className="pwc-footer-brand" to="/" aria-label="Paw World Care — Trang chủ">
          <BrandLogo alt="" />
        </Link>
        <p>Chăm sóc chó mèo theo lịch trình của gia đình bạn.</p>
      </div>
      <nav className="pwc-footer-links" aria-label="Liên kết hỗ trợ">
        <Link to="/services">Danh mục dịch vụ</Link>
        <Link to="/service-areas">Khu vực & chính sách</Link>
        <Link to="/sign-in">Bắt đầu đặt dịch vụ</Link>
      </nav>
      <p className="pwc-footer-note">Cần hỗ trợ? Hãy bắt đầu từ dịch vụ phù hợp để tiếp tục quy trình đặt lịch.</p>
    </div>
  </footer>;
}