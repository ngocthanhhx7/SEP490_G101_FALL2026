import { useState } from 'react';
import { Link } from 'react-router-dom';
import { subscribeToNewsletter } from '../../services/newsletter-api.js';

const a = '/assets/figma-public/';
export function PublicFooter({ subscribe = subscribeToNewsletter }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(''); setFailed(false);
    try { await subscribe(email.trim()); setEmail(''); setNotice('Đã tiếp nhận đăng ký nhận tin của bạn.'); }
    catch { setFailed(true); setNotice('Chưa thể đăng ký nhận tin. Vui lòng thử lại sau.'); }
    finally { setBusy(false); }
  }
  return <footer className="pwc-public-footer" id="contact">
    <div className="pwc-public-footer-inner">
      <div className="pwc-footer-identity">
        <Link className="pwc-footer-wordmark" to="/" aria-label="PawWorld — Trang chủ">PawWorld</Link>
        <p>Mỗi bữa ăn<br />Một vòng tay nhân ái.</p>
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
        <Link to="/services?q=spa">Spa chó mèo tại nhà</Link>
        <Link to="/services?q=chăm sóc">Chăm sóc pet cưng tại nhà</Link>
      </nav>
      <nav className="pwc-footer-column" aria-label="Liên kết hỗ trợ">
        <h2>HỖ TRỢ</h2>
        <Link to="/">Trang chủ</Link><Link to="/#about">Về chúng tôi</Link>
        <Link to="/#stories">Câu truyện</Link><a href="#contact">Liên hệ</a>
      </nav>
      <form className="pwc-newsletter" onSubmit={submit}>
        <h2>ĐĂNG KÝ NHẬN TIN</h2><p>Đăng ký để biết các tin tức dịch vụ Pawworld</p>
        <label className="pwc-visually-hidden" htmlFor="pwc-newsletter-email">Email nhận tin</label>
        <input id="pwc-newsletter-email" type="email" required maxLength={254} autoComplete="email"
          placeholder="Email của bạn..." value={email} onChange={event => setEmail(event.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi'}</button>
        {notice && <p className="pwc-newsletter-notice" role={failed ? 'alert' : 'status'}>{notice}</p>}
      </form>
      <div className="pwc-footer-bottom"><p>© 2026 PawWorld. All rights reserved. Keep on wagging!</p>
        <nav aria-label="Chính sách"><Link to="/policies/privacy">Privacy Policy</Link>
          <Link to="/policies/terms">Terms of Service</Link></nav>
      </div>
    </div>
  </footer>;
}
