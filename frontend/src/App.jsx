import { useEffect, useRef, useState } from 'react';
import {
  registerAccount,
  requestLoginOtp,
  resendRegistrationOtp,
  resendSitterApplicationOtp,
  cancelSitterApplication,
  submitSitterApplication,
  verifyLoginOtp,
  verifyRegistration,
  verifySitterApplicationOtp,
  getPetSitterApplicationStatus,
  logoutAccount,
  getCurrentUser,
} from './services/auth-api.js';

const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Thông tin chưa đúng định dạng. Bạn kiểm tra lại giúp mình nhé.',
  CONTACT_ALREADY_USED: 'Thông tin này đã có tài khoản. Hãy đăng nhập nhé.',
  REGISTRATION_PENDING: 'Bạn đã bắt đầu đăng ký bằng thông tin này. Hãy nhập mã đã nhận hoặc yêu cầu gửi lại.',
  REGISTRATION_NOT_FOUND: 'Không tìm thấy lượt đăng ký. Bạn có thể bắt đầu lại.',
  REGISTRATION_COMPLETED: 'Tài khoản đã được xác minh. Hãy đăng nhập để tiếp tục.',
  OTP_INVALID: 'Mã OTP chưa chính xác. Bạn kiểm tra lại nhé.',
  OTP_NOT_VALID: 'Mã OTP đã hết hạn hoặc không còn hiệu lực. Hãy yêu cầu mã mới.',
  OTP_RATE_LIMITED: 'Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.',
  OTP_RESEND_TOO_SOON: 'Vui lòng chờ một chút trước khi gửi mã mới.',
  PENDING_RESEND_LIMIT_REACHED: 'Bạn đã đạt giới hạn gửi lại mã cho lượt đăng ký này.',
  PENDING_OTP_ATTEMPTS_EXHAUSTED: 'Bạn đã nhập sai quá số lần cho phép. Hãy thử đăng ký lại sau.',
  IP_RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  OTP_DELIVERY_FAILED: 'Chưa gửi được mã OTP. Vui lòng thử lại sau.',
  SITTER_APPLICATION_EXISTS: 'Email hoặc số điện thoại này đã có hồ sơ Pet Sitter.',
  SITTER_APPLICATION_NOT_FOUND: 'Không tìm thấy hồ sơ ứng tuyển hoặc hồ sơ đã hết hạn.',
  SITTER_APPLICATION_SUBMITTED: 'Hồ sơ này đã được gửi để xét duyệt.',
  INTERNAL_ERROR: 'Hệ thống đang bận. Vui lòng thử lại sau.',
};

function formatError(error) {
  const message = ERROR_MESSAGES[error.code] ?? error.message;
  if (error.retryAfterSeconds) return `${message} Thử lại sau ${error.retryAfterSeconds} giây.`;
  return message;
}

function PawMark() {
  return <span className="paw-mark" aria-hidden="true">✿</span>;
}

function Header({ onNavigate, user, onLogout }) {
  return (
    <header className="site-header">
      <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); onNavigate('home'); }} aria-label="PawWorld trang chủ">
        <img src="/assets/logo/ngang.svg" alt="PawWorld" />
      </a>
      <nav className="main-nav" aria-label="Điều hướng chính">
        <a href="#home">Trang chủ</a>
        <a href="#story">Câu chuyện</a>
        <a href="#services">Dịch vụ</a>
        <a href="#about">Về chúng tôi</a>
        <a href="#contact">Liên hệ</a>
      </nav>
      {user ? (
        <div className="header-account">
          <span className="header-avatar" aria-hidden="true">{user.fullName?.trim()?.charAt(0)?.toUpperCase() || 'P'}</span>
          <span className="header-user-name">{user.fullName || 'Thành viên PawWorld'}</span>
          <button className="header-logout" type="button" onClick={onLogout}>Đăng xuất</button>
        </div>
      ) : (
        <button className="header-login" type="button" onClick={() => onNavigate('login')}>
          <span aria-hidden="true">♙</span> Đăng nhập
        </button>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <img src="/assets/logo/ngang.svg" alt="PawWorld" />
          <p>Mỗi bữa ăn.<br />Một vòng tay nhân ái.</p>
          <div className="social-links" aria-label="Mạng xã hội">
            <a href="#facebook" aria-label="Facebook">f</a>
            <a href="#tiktok" aria-label="TikTok">♪</a>
            <a href="#instagram" aria-label="Instagram">◎</a>
          </div>
        </div>
        <div className="footer-column">
          <h3>Dịch vụ</h3>
          <a href="#walk">Dắt chó đi dạo</a>
          <a href="#spa">Spa chó mèo tại nhà</a>
          <a href="#care">Chăm sóc pet tại nhà</a>
        </div>
        <div className="footer-column">
          <h3>Hỗ trợ</h3>
          <a href="#home">Trang chủ</a>
          <a href="#about">Về chúng tôi</a>
          <a href="#story">Câu chuyện</a>
          <a href="#contact">Liên hệ</a>
        </div>
        <form className="newsletter" onSubmit={(event) => event.preventDefault()}>
          <h3>Đăng ký nhận tin</h3>
          <p>Nhận cập nhật về các dịch vụ PawWorld.</p>
          <label className="visually-hidden" htmlFor="newsletter-email">Email của bạn</label>
          <input id="newsletter-email" type="email" placeholder="Email của bạn..." />
          <button type="submit">Gửi</button>
        </form>
      </div>
      <div className="footer-bottom">
        <span>© 2026 PawWorld. All rights reserved. Keep on wagging!</span>
        <div><a href="#privacy">Chính sách bảo mật</a><a href="#terms">Điều khoản dịch vụ</a></div>
      </div>
    </footer>
  );
}

function HomePage({ onNavigate }) {
  const serviceCards = [
    { image: '/assets/cat/Happy%20Cat%20User%202.png', alt: 'Mèo cưng bên khay dâu', title: 'Ghé thăm & chơi cùng bé', text: 'Người chăm sóc đồng hành cùng thú cưng ngay tại nhà.' },
    { image: '/assets/cat/image%20652.png', alt: 'Những chú mèo đang nghỉ ngơi bên nhau', title: 'Chăm sóc tại nhà', text: 'Giữ nếp sinh hoạt quen thuộc cho bé khi bạn bận rộn.' },
    { image: '/assets/paw/Cat%20Food%20Kit.png', alt: 'Sản phẩm thức ăn cho thú cưng', title: 'Chăm sóc dinh dưỡng', text: 'Hỗ trợ bữa ăn và những lưu ý riêng của thú cưng.' },
  ];
  return (
    <main className="home-page" id="home">
      <section className="home-hero page-section">
        <div className="home-hero-copy">
          <span className="home-kicker"><PawMark /> DỊCH VỤ CHĂM SÓC THÚ CƯNG TẠI NHÀ</span>
          <h1>Chăm pet tận nhà,<br />bé khỏe sen vui.</h1>
          <p>Đặt lịch chăm sóc, ghé thăm và chơi cùng bé — để thú cưng luôn được quan tâm theo cách thân thuộc nhất.</p>
          <div className="home-hero-actions">
            <button type="button" className="home-button home-button-primary" onClick={() => onNavigate('login')}>Đặt dịch vụ ngay <span>→</span></button>
            <a className="home-button home-button-secondary" href="#services">Khám phá dịch vụ</a>
          </div>
          <div className="home-trust-tags"><span>♡ Người chăm sóc tận tâm</span><span>✦ An tâm trong từng dịch vụ</span></div>
        </div>
        <div className="home-hero-visual">
          <div className="hero-photo-frame"><img src="/assets/cat/Happy%20Cat%20User%202.png" alt="Mèo cưng đang khám phá đĩa dâu tây" /></div>
          <div className="hero-photo-sticker"><span>✿</span><div><strong>Yêu thương mỗi ngày</strong><small>Chăm sóc bé bằng cả trái tim</small></div></div>
          <span className="hero-sparkle sparkle-one">✦</span><span className="hero-sparkle sparkle-two">♡</span>
        </div>
      </section>

      <section className="home-benefits page-section" id="about">
        <div className="home-section-heading"><span className="home-kicker">PAWWORLD CARE</span><h2>Bé được chăm tại nhà,<br className="mobile-break" /> bạn an tâm hơn</h2><p>Dịch vụ chăm sóc phù hợp với nhịp sống của bạn — ngay tại nhà.</p></div>
        <div className="benefit-grid">
          <article className="benefit-card benefit-lavender"><span>⌂</span><h3>Ghế thăm & chơi cùng bé</h3><p>Cho bé thêm sự quan tâm khi bạn bận việc.</p></article>
          <div className="benefit-photo"><img src="/assets/cat/image%20650.png" alt="Hai chú mèo con nằm trong chiếc hộp ấm áp" /></div>
          <article className="benefit-card benefit-peach"><span>◷</span><h3>Lịch hẹn linh hoạt</h3><p>Chọn thời gian phù hợp với gia đình và thú cưng.</p></article>
          <article className="benefit-card benefit-mint"><span>♡</span><h3>Chăm sóc quen thuộc</h3><p>Bé được ở trong không gian thân quen của mình.</p></article>
          <article className="benefit-card benefit-yellow"><span>▣</span><h3>Cập nhật rõ ràng</h3><p>Theo dõi thông tin chăm sóc sau mỗi buổi hẹn.</p></article>
        </div>
      </section>

      <section className="home-steps page-section" id="how-it-works">
        <div className="home-section-heading"><span className="home-kicker">ĐƠN GIẢN & THUẬN TIỆN</span><h2>Đặt lịch chăm sóc bé thật dễ dàng</h2></div>
        <div className="steps-grid">
          <article><span className="step-number step-coral">1</span><h3>Chọn dịch vụ & thú cưng</h3><p>Chia sẻ nhu cầu chăm sóc dành cho bé.</p></article>
          <article><span className="step-number step-green">2</span><h3>Chọn lịch phù hợp</h3><p>Chọn thời gian và địa điểm bạn mong muốn.</p></article>
          <article><span className="step-number step-blue">3</span><h3>Theo dõi buổi chăm sóc</h3><p>Cập nhật thông tin để bạn yên tâm hơn.</p></article>
        </div>
      </section>

      <section className="home-services" id="services">
        <div className="home-services-inner">
          <div className="services-heading"><div><span className="home-kicker">DÀNH CHO BÉ CƯNG</span><h2>Dịch vụ có sẵn</h2><p>Chọn cách chăm sóc phù hợp với bé yêu.</p></div><a href="#how-it-works">Cách đặt dịch vụ <span>→</span></a></div>
          <div className="service-card-grid">
            {serviceCards.map((service) => (
              <article className="home-service-card" key={service.title}>
                <img src={service.image} alt={service.alt} />
                <div className="home-service-card-copy"><h3>{service.title}</h3><p>{service.text}</p><button type="button" onClick={() => onNavigate('login')}>Tìm hiểu <span>→</span></button></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-story page-section" id="story">
        <div className="story-photo"><img src="/assets/cat/image%20650.png" alt="Những chú mèo được quây quần chăm sóc trong chiếc hộp" /><span>♡</span></div>
        <div className="story-copy"><span className="home-kicker">PAWWORLD CARE</span><h2>“Bé ở nhà thân quen,<br />bạn yên tâm chăm lo”</h2><p>PawWorld kết nối bạn với dịch vụ chăm sóc thú cưng tại nhà, để bé luôn được quan tâm trong không gian quen thuộc.</p><div className="story-values"><div><strong>Thân quen</strong><span>Bé được ở nơi mình yêu thích.</span></div><div><strong>Tận tâm</strong><span>Chăm sóc theo nhu cầu của bé.</span></div></div><button type="button" className="home-button home-button-primary" onClick={() => onNavigate('login')}>Bắt đầu cùng PawWorld <span>→</span></button></div>
      </section>

      <section className="home-community page-section" id="community">
        <div className="home-section-heading"><span className="home-kicker">NHỮNG NGƯỜI BẠN ĐÁNG YÊU</span><h2>Chia sẻ từ cộng đồng PawWorld</h2><p>Mỗi bé cưng đều xứng đáng được yêu thương.</p></div>
        <div className="community-gallery">
          <figure className="community-photo community-photo-one"><img src="/assets/cat/1.png" alt="Mèo thưởng thức bữa ăn" /><figcaption>Chăm sóc từ những điều nhỏ bé</figcaption></figure>
          <figure className="community-photo community-photo-two"><img src="/assets/cat/image%20651.png" alt="Mèo con đang nhìn về phía trước" /><figcaption>Thêm thời gian vui chơi bên nhau</figcaption></figure>
          <figure className="community-photo community-photo-three"><img src="/assets/cat/image%20652.png" alt="Những chú mèo con nằm cạnh nhau" /><figcaption>Ở nhà thân quen, bé luôn an tâm</figcaption></figure>
        </div>
      </section>
    </main>
  );
}

function ContactChoice({ value, onChange }) {
  return (
    <div className="contact-choice" role="group" aria-label="Phương thức nhận mã OTP">
      <button type="button" className={value === 'email' ? 'selected' : ''} onClick={() => onChange('email')}>
        <span className="choice-dot" /> Email
      </button>
      <button type="button" className={value === 'phone' ? 'selected' : ''} onClick={() => onChange('phone')}>
        <span className="choice-dot" /> Số điện thoại
      </button>
    </div>
  );
}

function OtpDigitFields({ value, onChange }) {
  const inputRefs = useRef([]);
  const digits = value.padEnd(6, ' ').split('');

  function updateAt(index, inputValue) {
    const typedDigits = inputValue.replace(/\D/g, '');
    const next = value.padEnd(6, ' ').split('');
    if (typedDigits.length > 1) {
      [...typedDigits].slice(0, 6 - index).forEach((digit, offset) => { next[index + offset] = digit; });
      const nextValue = next.join('').trimEnd();
      onChange(nextValue);
      inputRefs.current[Math.min(index + typedDigits.length, 5)]?.focus();
      return;
    }
    next[index] = typedDigits || ' ';
    onChange(next.join('').trimEnd());
    if (typedDigits && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
  }

  return (
    <div className="otp-digit-row" role="group" aria-label="Mã OTP gồm 6 chữ số">
      {digits.map((digit, index) => (
        <input
          // Each input is fixed to its position in the six digit code.
          key={index}
          ref={(element) => { inputRefs.current[index] = element; }}
          aria-label={`Chữ số OTP thứ ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          inputMode="numeric"
          maxLength={index === 0 ? 6 : 1}
          value={digit.trim()}
          onChange={(event) => updateAt(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
        />
      ))}
    </div>
  );
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function SelectedFilePreview({ file, emptyText, compact = false }) {
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file) return <small className="selected-file-name">{emptyText}</small>;
  if (file.type.startsWith('image/')) {
    return <img className={compact ? 'file-preview-image compact' : 'file-preview-image'} src={previewUrl} alt={`Preview of ${file.name}`} />;
  }
  if (file.type === 'application/pdf') {
    return <div className={compact ? 'file-preview-pdf compact' : 'file-preview-pdf'}><iframe title={file.name} src={previewUrl} /><span>{file.name}</span></div>;
  }
  return <div className="file-preview-document">{file.name}</div>;
}

function PetSitterApplicationStatus({ application, onLogout }) {
  const submittedAt = application.submittedAt
    ? new Date(application.submittedAt).toLocaleString('vi-VN')
    : null;
  return (
    <section className="auth-card application-status-card" aria-labelledby="application-status-title">
      <div className="status-card-topline"><span className="status-product-pill">&#10022; PAW SITTER E-KYC</span></div>
      <div className="status-hero-icon" aria-hidden="true"><span>&#9203;</span><b>&#10003;</b></div>
      <div className="status-state-pill"><span /> Đang chờ xét duyệt hồ sơ</div>
      <h1 id="application-status-title">Đơn ứng tuyển đã được tiếp nhận</h1>
      <p className="status-intro">Cảm ơn bạn đã đăng ký trở thành Pet Sitter. Email đã được xác minh và hồ sơ đang đợi admin xem xét. Bạn có thể đăng nhập lại bất cứ lúc nào để xem trạng thái.</p>

      <div className="application-summary">
        <div className="application-summary-heading">
          <span className="summary-icon">&#128203;</span>
          <div><small>TRẠNG THÁI HỒ SƠ</small><strong>Chờ admin duyệt</strong></div>
          {submittedAt && <time>{submittedAt}</time>}
        </div>
        <div className="application-summary-person">
          <span aria-hidden="true">&#128100;</span>
          <div><small>ỨNG VIÊN ĐĂNG KÝ</small><strong>{application.fullName || 'Pet Sitter'}</strong><span>{application.email}</span></div>
        </div>
      </div>

      <div className="review-roadmap-heading"><h2>Lộ trình xét duyệt hồ sơ</h2><span>Bước 2 / 3</span></div>
      <ol className="review-roadmap">
        <li className="roadmap-done"><span className="roadmap-number">&#10003;</span><b>Gửi hồ sơ</b><small>Thông tin đã được ghi nhận</small></li>
        <li className="roadmap-current"><span className="roadmap-number">2</span><b>Admin xem xét</b><small>Hồ sơ đang chờ duyệt</small></li>
        <li><span className="roadmap-number">3</span><b>Cập nhật kết quả</b><small>Trạng thái được cập nhật sau</small></li>
      </ol>

      <div className="status-note"><span aria-hidden="true">&#9432;</span><p>Trong thời gian chờ, bạn có thể đăng nhập bằng email này để kiểm tra trạng thái. Quyền hoạt động Pet Sitter chỉ được mở sau khi hồ sơ được duyệt.</p></div>
      <button className="status-logout-button" type="button" onClick={onLogout}>Đăng xuất <span>&#8594;</span></button>
      <p className="status-security-note">&#128274; Thông tin hồ sơ được bảo mật theo chính sách PawWorld.</p>
    </section>
  );
}

function AuthCard({ mode, accountType, onAccountTypeChange, onNavigate, onAuthenticated, onLogout }) {
  const [contactType, setContactType] = useState('email');
  const [step, setStep] = useState('details');
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sitterEmail, setSitterEmail] = useState('');
  const [sitterName, setSitterName] = useState('');
  const [sitterSubmittedAt, setSitterSubmittedAt] = useState(null);
  const [sitterDestination, setSitterDestination] = useState('');
  const [sitterApplicationToken, setSitterApplicationToken] = useState('');
  const [sitterOtp, setSitterOtp] = useState('');
  const [sitterExpiry, setSitterExpiry] = useState(300);
  const [sitterResendCooldown, setSitterResendCooldown] = useState(60);
  const [sitterFeedback, setSitterFeedback] = useState('');
  const [sitterSelectedFiles, setSitterSelectedFiles] = useState({});
  const certificatesInputRef = useRef(null);
  const [complete, setComplete] = useState(false);
  const [loginUser, setLoginUser] = useState(null);
  const isRegister = mode === 'register';
  const isSitter = isRegister && accountType === 'sitter';

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    setStep('details');
    setError('');
    setNotice('');
    setComplete(false);
    setLoginUser(null);
    setOtp('');
  }, [mode]);

  useEffect(() => {
    setError('');
    setNotice('');
    setStep('details');
    setSitterFeedback('');
  }, [accountType]);

  useEffect(() => {
    if (step !== 'sitter-otp' || sitterExpiry <= 0) return undefined;
    const timer = window.setTimeout(() => setSitterExpiry((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, sitterExpiry]);

  useEffect(() => {
    if (step !== 'sitter-otp' || sitterResendCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setSitterResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, sitterResendCooldown]);

  const destinationHint = contactType === 'email' ? 'email của bạn' : 'số điện thoại của bạn';

  async function handleSendCode(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isRegister) {
        const result = await registerAccount({
          fullName,
          [contactType]: contact,
        });
        setRegistrationToken(result.registrationToken);
        setNotice(`Mã xác thực đã được gửi đến ${result.maskedDestination}.`);
      } else {
        await requestLoginOtp({ contactType, contact });
        setNotice(`Nếu ${destinationHint} thuộc tài khoản hoặc hồ sơ đủ điều kiện, mã OTP sẽ được gửi đến bạn.`);
      }
      setStep('otp');
      setCooldown(60);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isRegister) {
        await verifyRegistration(otp, registrationToken);
      } else {
        const result = await verifyLoginOtp({ contactType, contact, otp });
        sessionStorage.setItem('pawworld_access_token', result.accessToken);
        sessionStorage.setItem('pawworld_user', JSON.stringify(result.user));
        if (result.user?.role === 'PET_SITTER_APPLICANT') {
          const status = await getPetSitterApplicationStatus(result.accessToken);
          setLoginUser({ ...result.user, ...status });
          onAuthenticated({ ...result.user, ...status });
        } else {
          setLoginUser(result.user);
          onAuthenticated(result.user);
        }
      }
      setComplete(true);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isRegister) {
        const result = await resendRegistrationOtp(registrationToken);
        setNotice(`Mã mới đã được gửi đến ${result.maskedDestination}.`);
      } else {
        await requestLoginOtp({ contactType, contact });
        setNotice(`Nếu ${destinationHint} thuộc tài khoản hoặc hồ sơ đủ điều kiện, mã OTP sẽ được gửi đến bạn.`);
      }
      setCooldown(60);
    } catch (requestError) {
      setError(formatError(requestError));
      if (requestError.retryAfterSeconds) setCooldown(requestError.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setStep('details');
    setOtp('');
    setRegistrationToken('');
    setError('');
    setNotice('');
  }

  async function handleSitterSubmit(event) {
    event.preventDefault();
    setError('');
    setSitterFeedback('');
    setBusy(true);
    try {
      const formData = new FormData(event.currentTarget);
      const submittedEmail = formData.get('email')?.toString() ?? '';
      const submittedName = formData.get('fullName')?.toString() ?? '';
      const result = await submitSitterApplication(formData);
      setSitterEmail(submittedEmail);
      setSitterName(submittedName);
      setSitterDestination(result.maskedDestination);
      setSitterApplicationToken(result.applicationToken);
      setSitterOtp('');
      setSitterExpiry(300);
      setSitterResendCooldown(60);
      setSitterFeedback('');
      setStep('sitter-otp');
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSitterVerify(event) {
    event.preventDefault();
    setError('');
    setSitterFeedback('');
    setBusy(true);
    try {
      const result = await verifySitterApplicationOtp(sitterOtp, sitterApplicationToken);
      setSitterSubmittedAt(result.submittedAt ?? new Date().toISOString());
      setComplete(true);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSitterResend() {
    setError('');
    setSitterFeedback('');
    setBusy(true);
    try {
      const result = await resendSitterApplicationOtp(sitterApplicationToken);
      setSitterExpiry(300);
      setSitterResendCooldown(60);
      setSitterDestination(result.maskedDestination);
      setSitterFeedback(`Mã mới đã được gửi đến ${result.maskedDestination}.`);
    } catch (requestError) {
      setError(formatError(requestError));
      if (requestError.retryAfterSeconds) setSitterResendCooldown(requestError.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  }

  async function editSitterApplication() {
    setError('');
    setSitterFeedback('');
    setBusy(true);
    try {
      if (sitterApplicationToken) await cancelSitterApplication(sitterApplicationToken);
      setSitterApplicationToken('');
      setSitterSelectedFiles({});
      setStep('details');
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    if (isSitter) {
      return (
        <PetSitterApplicationStatus
          application={{ fullName: sitterName, email: sitterEmail, submittedAt: sitterSubmittedAt }}
          onLogout={onLogout}
        />
      );
    }
    if (!isRegister && loginUser?.role === 'PET_SITTER_APPLICANT') {
      return (
        <PetSitterApplicationStatus
          application={loginUser}
          onLogout={onLogout}
        />
      );
    }
    return (
      <section className="auth-card success-card" aria-live="polite">
        <span className="success-icon">✓</span>
        <p className="eyebrow">PawWorld chào bạn</p>
        <h1>{isRegister ? 'Tài khoản đã sẵn sàng!' : 'Đăng nhập thành công!'}</h1>
        <p className="card-subtitle">
          {isRegister
            ? 'Email hoặc số điện thoại của bạn đã được xác minh. Bạn có thể đăng nhập để tiếp tục.'
            : 'Chúc bạn và bé cưng có những trải nghiệm thật vui cùng PawWorld.'}
        </p>
        <button className="primary-button" type="button" onClick={() => onNavigate('home')}>
          {isRegister ? 'Về trang chủ PawWorld' : 'Khám phá PawWorld'} <span>→</span>
        </button>
        {isRegister && <p className="home-signin-prompt">Đã có tài khoản? <button type="button" className="text-button" onClick={() => onNavigate('login')}>Đăng nhập bằng OTP</button></p>}
      </section>
    );
  }

  if (isSitter) {
    if (step === 'sitter-otp') {
      return (
        <section className="auth-card sitter-card sitter-otp-card" aria-labelledby="sitter-otp-title">
          <div className="tape tape-top" aria-hidden="true" />
          <div className="sitter-progress-row">
            <span className="sitter-step-pill"><span>✦</span> Ứng tuyển Pet Sitter · Bước 2/2</span>
            <strong>Hoàn tất 90%</strong>
          </div>
          <div className="sitter-otp-content">
            <div className="otp-emblem" aria-hidden="true"><span>✉</span><i>✓</i><b>🐾</b></div>
            <h1 id="sitter-otp-title">Xác nhận mã OTP</h1>
            <p className="sitter-otp-description">Mã xác thực gồm 6 chữ số sẽ được gửi an toàn đến hòm thư tuyển dụng của bạn:</p>
            <div className="sitter-email-line">
              <span aria-hidden="true">@</span><strong>{sitterEmail || 'email của bạn'}</strong>
              <button type="button" disabled={busy} onClick={editSitterApplication}>✎ <u>Thay đổi</u></button>
            </div>
            <div className="preview-notice" role="status">Mã xác thực đã được gửi đến <strong>{sitterDestination || sitterEmail}</strong>. Nếu chưa thấy, hãy kiểm tra cả thư mục Spam / Rác.</div>
            <form className="sitter-otp-form" onSubmit={handleSitterVerify}>
              <OtpDigitFields value={sitterOtp} onChange={(next) => { setSitterOtp(next); setSitterFeedback(''); }} />
              {sitterOtp.length !== 6 && <span className="otp-entry-hint">Nhập đủ 6 chữ số để xác nhận</span>}
              {error && <div className="form-message error-message" role="alert">{error}</div>}
              <div className="sitter-otp-actions">
                <span className="expiry-clock"><b>◴</b> Mã có hiệu lực: <strong>{formatClock(sitterExpiry)}</strong></span>
                <button
                  className="resend-link"
                  type="button"
                  disabled={sitterResendCooldown > 0}
                  onClick={handleSitterResend}
                >
                  ↻ <u>{sitterResendCooldown > 0 ? `Gửi lại mã OTP (${sitterResendCooldown}s)` : 'Gửi lại mã OTP'}</u>
                </button>
              </div>
              {sitterFeedback && <div className="form-message success-message" role="status">{sitterFeedback}</div>}
              <div className="otp-tip"><span>ⓘ</span><p><strong>Mẹo nhỏ:</strong> Hãy kiểm tra kỹ cả hòm thư <em>Spam / Rác</em> hoặc mục <em>Quảng cáo</em> nếu bạn chưa nhận được thư sau 1–2 phút.</p></div>
              <button className="sitter-confirm-button" type="submit" disabled={busy || sitterOtp.length !== 6}>{busy ? 'Đang xác thực...' : 'Xác nhận & Nộp hồ sơ ứng tuyển'} <span>➜</span></button>
            </form>
            <button className="back-to-profile" type="button" disabled={busy} onClick={editSitterApplication}>← Quay lại chỉnh sửa thông tin hồ sơ</button>
            <div className="safe-trust"><span>◈</span> Bảo mật thông tin ứng viên chuẩn <strong>PawWorld Safe & Trust</strong></div>
          </div>
          <div className="tape tape-bottom" aria-hidden="true" />
        </section>
      );
    }

    return (
      <section className="auth-card sitter-card" aria-labelledby="auth-title">
        <div className="tape tape-top" aria-hidden="true" />
        <div className="mode-switch role-switch" role="tablist" aria-label="Loại tài khoản">
          <button type="button" role="tab" aria-selected={false} onClick={() => onAccountTypeChange('customer')}>Khách hàng (Pet Parent)</button>
          <button type="button" role="tab" aria-selected="true" className="active">Trở thành Pet Sitter</button>
        </div>
        <div className="sitter-intro">
          <span className="recruitment-pill">Tuyển dụng cộng tác viên · Toàn quốc</span>
          <p>Ứng tuyển trở thành <strong>Pet Sitter</strong></p>
          <h1 id="auth-title">Cùng PawWorld chăm sóc những người bạn bốn chân</h1>
          <p>Chia sẻ sự tận tâm của bạn và trở thành người đồng hành đáng tin cậy với các bé cưng.</p>
        </div>
        <form className="sitter-form" onSubmit={handleSitterSubmit}>
          <div className="sitter-section-heading"><span>1</span><div><strong>Thông tin cá nhân</strong><small>Thông tin định danh liên lạc cơ bản của bạn</small></div></div>
          <label className="field-group"><span>Họ và tên đầy đủ *</span><input name="fullName" required minLength={2} maxLength={100} autoComplete="name" placeholder="Nguyễn Văn A" /></label>
          <div className="sitter-fields two-columns">
            <label className="field-group"><span>Địa chỉ Email *</span><input name="email" required type="email" autoComplete="email" defaultValue={sitterEmail} placeholder="email@example.com" /></label>
            <label className="field-group"><span>Số điện thoại liên hệ *</span><input name="phone" required type="tel" autoComplete="tel" placeholder="0912 345 678" /></label>
          </div>
          <div className="sitter-fields two-columns">
            <label className="field-group"><span>Tuổi *</span><input name="age" required type="number" min="18" max="100" placeholder="Ví dụ: 24" /></label>
            <label className="field-group"><span>Giới tính *</span><select name="gender" required defaultValue=""><option value="" disabled>Chọn giới tính</option><option value="FEMALE">Nữ</option><option value="MALE">Nam</option><option value="OTHER">Khác</option><option value="UNDISCLOSED">Không muốn chia sẻ</option></select></label>
          </div>
          <label className="field-group"><span>Khu vực sinh sống / Địa chỉ hiện tại *</span><input name="location" required placeholder="Quận Hoàn Kiếm, Hà Nội hoặc Quận 1, TP.HCM" /></label>

          <div className="sitter-section-heading section-spaced"><span>2</span><div><strong>Kinh nghiệm & kỹ năng</strong><small>Chia sẻ thêm niềm vui của các bé pet bạn tự tin phụ trách</small></div></div>
          <fieldset className="choice-fieldset"><legend>Kinh nghiệm nuôi & chăm sóc thú cưng *</legend><div className="experience-choices"><label><input required type="radio" name="experience" value="under-one" /> Dưới 1 năm</label><label><input type="radio" name="experience" value="one-to-three" /> 1–3 năm</label><label><input type="radio" name="experience" value="over-three" /> Trên 3 năm</label></div></fieldset>
          <fieldset className="choice-fieldset"><legend>Các giống thú cưng bạn tự tin tiếp nhận *</legend><div className="pet-choices"><label><input type="checkbox" name="acceptedSpecies" value="DOG" /> 🐶 Chó</label><label><input type="checkbox" name="acceptedSpecies" value="CAT" /> 🐱 Mèo</label></div></fieldset>
          <label className="field-group"><span>Giới thiệu ngắn về bản thân & tình yêu với thú cưng *</span><textarea name="bio" required minLength={20} rows={4} placeholder="Chia sẻ kinh nghiệm thực tế, tính cách hiền nhẫn, cách bạn xử lý khi thú cưng lo lắng..." /></label>

          <div className="sitter-section-heading section-spaced"><span>3</span><div><strong>Định danh & xác thực hồ sơ</strong><small>Đảm bảo an toàn tuyệt đối và tạo dựng uy tín với gia chủ</small></div></div>
          <div className="upload-row">
            <label className="upload-card"><span className="upload-avatar">📷</span><span><strong>Ảnh chân dung rõ mặt *</strong><small>Ảnh sáng, không đeo kính râm hoặc khẩu trang.</small></span><SelectedFilePreview file={sitterSelectedFiles.portrait} emptyText="Ch&#432;a ch&#7885;n &#7843;nh" /><input name="portrait" required type="file" accept="image/png,image/jpeg" onChange={(event) => setSitterSelectedFiles((previous) => ({ ...previous, portrait: event.target.files?.[0] ?? null }))} /></label>
          </div>
          <label className="field-group"><span>Số CCCD / Định danh cá nhân (12 chữ số) *</span><input name="nationalId" required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} placeholder="001202000000" /></label>
          <div className="sitter-fields two-columns upload-pair">
            <label className="upload-card"><span className="upload-avatar">▤</span><strong>Mặt trước CCCD *</strong><small>Rõ góc cạnh, không lóa sáng</small><SelectedFilePreview file={sitterSelectedFiles.nationalIdFront} emptyText="Ch&#432;a ch&#7885;n t&#7879;p" /><input name="nationalIdFront" required type="file" accept="image/png,image/jpeg" onChange={(event) => setSitterSelectedFiles((previous) => ({ ...previous, nationalIdFront: event.target.files?.[0] ?? null }))} /></label>
            <label className="upload-card"><span className="upload-avatar">▤</span><strong>Mặt sau CCCD *</strong><small>Rõ vân tay và ngày cấp</small><SelectedFilePreview file={sitterSelectedFiles.nationalIdBack} emptyText="Ch&#432;a ch&#7885;n t&#7879;p" /><input name="nationalIdBack" required type="file" accept="image/png,image/jpeg" onChange={(event) => setSitterSelectedFiles((previous) => ({ ...previous, nationalIdBack: event.target.files?.[0] ?? null }))} /></label>
          </div>

          <div className="sitter-section-heading section-spaced"><span>4</span><div><strong>Hồ sơ chứng chỉ bổ sung <em>(khuyến khích)</em></strong><small>Tăng độ tin cậy và ưu tiên hiển thị hồ sơ</small></div></div>
          <div className="certificate-upload"><span className="certificate-icon">&#127894;</span><strong>T&#7843;i ch&#7913;ng ch&#7881; s&#417; c&#7913;u th&#250; c&#432;ng, &#273;&#224;o t&#7841;o th&#250; y ho&#7863;c ch&#7913;ng nh&#7853;n li&#234;n quan</strong><small>&#272;&#7883;nh d&#7841;ng h&#7895; tr&#7907;: PDF, JPG, PNG (t&#7889;i &#273;a 10MB)</small><button className="upload-button" type="button" onClick={() => certificatesInputRef.current?.click()}>+ Ch&#7885;n t&#7879;p ch&#7913;ng ch&#7881;</button><input ref={certificatesInputRef} className="certificate-file-input" name="certificates" type="file" accept=".pdf,image/png,image/jpeg" multiple onChange={(event) => setSitterSelectedFiles((previous) => ({ ...previous, certificates: Array.from(event.target.files ?? []) }))} /><div className="certificate-preview-list">{sitterSelectedFiles.certificates?.length ? sitterSelectedFiles.certificates.map((file, index) => <SelectedFilePreview key={`${file.name}-${index}`} file={file} compact />) : <small className="selected-file-name">Ch&#432;a ch&#7885;n t&#7879;p</small>}</div></div>
          {notice && <div className="form-message success-message" role="status">{notice}</div>}
          <label className="consent-row"><input required type="checkbox" /> <span>Tôi cam kết các thông tin cung cấp trên là hoàn toàn chính xác và đồng ý tuân thủ nghiêm ngặt <a href="#terms">Quy chế hoạt động</a> & <a href="#privacy">Tiêu chuẩn an toàn Pet Sitter</a> của PawWorld.</span></label>
          {error && <div className="form-message error-message" role="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? '\u0110ang g\u1eedi m\u00e3 x\u00e1c th\u1ef1c...' : 'G\u1eedi m\u00e3 x\u00e1c th\u1ef1c & ti\u1ebfp t\u1ee5c'} <span>&rarr;</span></button>
          <p className="legal-copy">Đã có tài khoản? <button type="button" className="text-button" onClick={() => onNavigate('login')}>Đăng nhập với mã OTP</button></p>
        </form>
        <div className="tape tape-bottom" aria-hidden="true" />
      </section>
    );
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="tape tape-top" aria-hidden="true" />
      <div className="card-heading">
        <div className="heading-paw"><PawMark /></div>
        <p className="eyebrow">Gia nhập gia đình chăm sóc thú cưng</p>
        <h1 id="auth-title">{step === 'otp' ? 'Xác thực tài khoản' : isRegister ? 'Đăng ký tài khoản mới' : 'Chào mừng bạn trở lại'}</h1>
        <p className="card-subtitle">
          {step === 'otp'
            ? 'Nhập mã OTP 6 chữ số vừa được gửi cho bạn.'
            : isRegister
              ? 'Tạo tài khoản để chăm sóc bé cưng cùng PawWorld.'
              : 'Đăng nhập nhanh chóng và an toàn bằng mã OTP.'}
        </p>
      </div>

      {isRegister ? (
        <div className="mode-switch role-switch" role="tablist" aria-label="Loại tài khoản">
          <button type="button" role="tab" aria-selected="true" className="active">Khách hàng (Pet Parent)</button>
          <button type="button" role="tab" aria-selected="false" onClick={() => onAccountTypeChange('sitter')}>Trở thành Pet Sitter</button>
        </div>
      ) : (
        <p className="login-context">Đăng nhập Khách hàng hoặc xem trạng thái hồ sơ Pet Sitter</p>
      )}

      {step === 'details' ? (
        <form className="auth-form" onSubmit={handleSendCode}>
          {isRegister && (
            <label className="field-group">
              <span>Họ và tên của bạn</span>
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
              />
            </label>
          )}

          <div className="contact-label-row">
            <label className="field-group contact-field">
              <span>{isRegister ? 'Phương thức nhận mã OTP' : 'Đăng nhập bằng'}</span>
            </label>
            <ContactChoice value={contactType} onChange={(value) => { setContactType(value); setContact(''); }} />
          </div>

          <label className="field-group">
            <span>{contactType === 'email' ? 'Địa chỉ email' : 'Số điện thoại'}</span>
            <div className="input-with-icon">
              <span className="field-icon" aria-hidden="true">{contactType === 'email' ? '✉' : '☎'}</span>
              <input
                autoComplete={contactType === 'email' ? 'email' : 'tel'}
                required
                type={contactType === 'email' ? 'email' : 'tel'}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={contactType === 'email' ? 'hello@example.com' : '0912 345 678'}
              />
            </div>
            {contactType === 'phone' && <small className="field-hint">Hỗ trợ số điện thoại Việt Nam.</small>}
          </label>

          {error && <div className="form-message error-message" role="alert">{error}</div>}
          <div className="privacy-note"><span aria-hidden="true">♧</span> Thông tin của bạn được bảo mật và chỉ dùng cho tài khoản PawWorld.</div>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Đang gửi yêu cầu...' : isRegister ? 'Tạo tài khoản & gửi mã OTP' : 'Gửi mã OTP đăng nhập'}
            {!busy && <span>→</span>}
          </button>
          <p className="legal-copy">Tiếp tục nghĩa là bạn đồng ý với <a href="#terms">Điều khoản dịch vụ</a> và <a href="#privacy">Chính sách bảo mật</a> của PawWorld.</p>
          <p className="legal-copy account-switch-copy">{isRegister ? 'Đã có tài khoản PawWorld?' : 'Chưa có tài khoản PawWorld?'} <button type="button" className="text-button" onClick={() => onNavigate(isRegister ? 'login' : 'register')}>{isRegister ? 'Đăng nhập với mã OTP' : 'Đăng ký ngay'}</button></p>
        </form>
      ) : (
        <form className="auth-form otp-form" onSubmit={handleVerify}>
          <div className="sent-to">
            <span className="sent-icon">✉</span>
            <span>Mã xác thực đã gửi đến <strong>{contact}</strong></span>
            <button type="button" onClick={startOver} aria-label="Sửa thông tin liên hệ">Sửa</button>
          </div>
          {notice && <div className="form-message success-message" role="status">{notice}</div>}
          <label className="field-group">
            <span>Mã xác thực OTP (6 chữ số)</span>
            <input
              className="otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • • • •"
            />
          </label>
          {error && <div className="form-message error-message" role="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={busy || otp.length !== 6}>
            {busy ? 'Đang xác thực...' : isRegister ? 'Xác thực & tạo tài khoản' : 'Xác thực & đăng nhập'}
            {!busy && <span>→</span>}
          </button>
          <div className="resend-row">
            <span>Chưa nhận được mã?</span>
            <button type="button" disabled={busy || cooldown > 0} onClick={handleResend}>
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã OTP'}
            </button>
          </div>
          <p className="otp-expiry">Mã OTP có hiệu lực trong 5 phút. Đừng chia sẻ mã này với bất kỳ ai.</p>
        </form>
      )}
      <div className="tape tape-bottom" aria-hidden="true" />
    </section>
  );
}

export default function App() {
  const [mode, setMode] = useState(window.location.hash === '#login' ? 'login' : window.location.hash === '#home' ? 'home' : 'register');
  const [accountType, setAccountType] = useState('customer');
  const [authenticatedUser, setAuthenticatedUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pawworld_user') ?? 'null'); } catch { return null; }
  });

  useEffect(() => {
    const token = sessionStorage.getItem('pawworld_access_token');
    if (!token || authenticatedUser) return;
    getCurrentUser(token).then((user) => {
      sessionStorage.setItem('pawworld_user', JSON.stringify(user));
      setAuthenticatedUser(user);
    }).catch(() => {
      sessionStorage.removeItem('pawworld_access_token');
      sessionStorage.removeItem('pawworld_user');
    });
  }, [authenticatedUser]);

  function navigate(nextMode) {
    setMode(nextMode);
    setAccountType('customer');
    window.history.replaceState(null, '', nextMode === 'home' ? '#home' : nextMode === 'login' ? '#login' : '#register');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleLogout() {
    const token = sessionStorage.getItem('pawworld_access_token');
    try {
      if (token) await logoutAccount(token);
    } catch {
      // Clear local authentication even if the server session has already expired.
    } finally {
      sessionStorage.removeItem('pawworld_access_token');
      sessionStorage.removeItem('pawworld_user');
      setAuthenticatedUser(null);
      navigate('login');
    }
  }

  return (
    <div className="page-shell" id="top">
      <Header onNavigate={navigate} user={authenticatedUser} onLogout={handleLogout} />
      {mode === 'home' ? <HomePage onNavigate={navigate} /> : <main className="auth-main">
        <div className="decor decor-left" aria-hidden="true"><PawMark /></div>
        <div className="decor decor-right" aria-hidden="true"><PawMark /></div>
        <div className={`auth-layout ${mode === 'register' && accountType === 'sitter' ? 'sitter-active' : ''}`}>
          {!(mode === 'register' && accountType === 'sitter') && <div className="welcome-panel">
            <div className="welcome-copy">
              <span className="welcome-kicker"><PawMark /> DỊCH VỤ CHĂM SÓC THÚ CƯNG TẠI NHÀ</span>
              <h2>Yêu thương bé cưng,<br /><em>trọn vẹn mỗi ngày.</em></h2>
              <p>Tìm người bạn đồng hành đáng tin cậy để bé luôn được chăm sóc bằng cả trái tim.</p>
              <div className="welcome-perks">
                <div><span>♡</span><b>Người chăm sóc tận tâm</b></div>
                <div><span>✦</span><b>An tâm trong từng dịch vụ</b></div>
              </div>
            </div>
            <div className="pet-photo-frame">
              <img src="/assets/cat/Happy Cat User 2.png" alt="Mèo cưng đang khám phá chiếc đĩa dâu tây" />
              <span className="photo-caption">Mỗi bé cưng đều xứng đáng được yêu thương <span>♡</span></span>
            </div>
            <span className="floating-heart heart-one" aria-hidden="true">♡</span>
            <span className="floating-heart heart-two" aria-hidden="true">✦</span>
          </div>}
          <AuthCard
            mode={mode}
            accountType={accountType}
            onAccountTypeChange={setAccountType}
            onNavigate={navigate}
            onAuthenticated={setAuthenticatedUser}
            onLogout={handleLogout}
          />
        </div>
      </main>}
      <Footer />
    </div>
  );
}
