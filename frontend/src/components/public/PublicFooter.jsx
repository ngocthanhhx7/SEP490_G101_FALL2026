import { Link } from 'react-router-dom';

const a = '/assets/figma-public/';
export function PublicFooter() {
  return <footer className="pwc-public-footer" id="contact">
    <div className="pwc-public-footer-inner">
      <div className="pwc-footer-identity">
        <Link className="pwc-footer-wordmark" to="/" aria-label="PawWorldCare — Trang chủ">PawWorld<span className="pwc-brand-care">Care</span></Link>
        <p>Mỗi lượt chăm sóc<br />Một vòng tay an tâm.</p>
        <div className="pwc-footer-socials" aria-label="Mạng xã hội">
          <img src={a + 'footer-IcBaselineFacebook.svg'} alt="Facebook" />
          <img src={a + 'footer-Tiktok.svg'} alt="TikTok" />
          <span className="pwc-footer-instagram" role="img" aria-label="Instagram">
            <img src={a + 'footer-Group1.svg'} alt="" className="pwc-instagram-color" />
            <img src={a + 'footer-Vector.svg'} alt="" className="pwc-instagram-dot" />
            <img src={a + 'footer-Vector1.svg'} alt="" className="pwc-instagram-lens" />
            <img src={a + 'footer-Vector2.svg'} alt="" className="pwc-instagram-outline" />
          </span>
        </div>
      </div>
      <nav className="pwc-footer-column" aria-label="Dịch vụ">
        <h2>DỊCH VỤ</h2>
        <Link to="/services?q=dắt chó">Dắt chó đi dạo</Link>
        <Link to="/services?q=thú y">Đưa thú cưng đến lịch hẹn thú y</Link>
        <Link to="/services?q=chăm sóc">Chăm sóc pet cưng tại nhà</Link>
      </nav>
      <nav className="pwc-footer-column" aria-label="Liên kết hỗ trợ">
        <h2>HỖ TRỢ</h2>
        <Link to="/">Trang chủ</Link><Link to="/about">Về chúng tôi</Link>
        <Link to="/#stories">Câu truyện</Link><Link to="/contact">Liên hệ</Link>
      </nav>
      <nav className="pwc-footer-column pwc-footer-policies" aria-label="Trang chính sách">
        <h2>CHÍNH SÁCH</h2>
        <Link to="/policies">Tất cả chính sách dịch vụ</Link>
        <Link to="/policies/terms">Điều khoản sử dụng</Link>
        <Link to="/policies/privacy">Chính sách bảo mật</Link>
      </nav>
      <div className="pwc-footer-bottom"><p>© 2026 PawWorld. All rights reserved. Keep on wagging!</p>
        <nav aria-label="Chính sách"><Link to="/policies/privacy">Privacy Policy</Link>
          <Link to="/policies/terms">Terms of Service</Link></nav>
      </div>
    </div>
  </footer>;
}
