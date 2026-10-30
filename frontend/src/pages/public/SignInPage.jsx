import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginDestination } from '../../utils/role-access.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { otpFeedback } from '../../utils/otp-feedback.js';
import './auth-public.css';
import './sign-in.css';

const CHANNELS = { EMAIL: 'email', PHONE: 'phone' };

function messageFor(error) {
  if (otpFeedback(error?.code)) return otpFeedback(error.code);
  const messages = {
    OTP_RATE_LIMITED: 'Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.',
    VALIDATION_FAILED: 'Thông tin đăng nhập chưa đúng định dạng.',
    NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
    TIMEOUT: 'Kết nối quá thời gian. Vui lòng thử lại.',
    LOGIN_NOT_AVAILABLE: 'Đăng nhập chưa được kết nối trong phiên này.',
    SMS_UNAVAILABLE: 'SMS hiện không khả dụng. Bạn có thể thử đăng nhập bằng email đã xác minh.',
    OTP_DELIVERY_UNAVAILABLE: 'Chưa thể gửi mã OTP. Vui lòng thử lại sau.',
    PROVIDER_UNAVAILABLE: 'Chưa thể gửi mã OTP. Vui lòng thử lại sau hoặc chọn liên hệ đã xác minh khác.',
  };
  return messages[error?.code] ?? 'Đăng nhập chưa thành công. Vui lòng thử lại.';
}

export function SignInPage() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [channel, setChannel] = useState(CHANNELS.EMAIL);
  const [contact, setContact] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('contact');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [rememberDevice, setRememberDevice] = useState(false);

  function changeChannel(value) {
    setChannel(value); setContact(''); setCode(''); setChallengeId(''); setError('');
  }

  function loginContact() {
    const value = contact.trim();
    if (channel === CHANNELS.EMAIL) return value;
    const phone = value.replace(/[ ()-]/g, '');
    return /^0\d{9}$/.test(phone) ? `+84${phone.slice(1)}` : phone;
  }

  useEffect(() => {
    if (session.status === 'authenticated') navigate(loginDestination(session.user, location.state?.from), { replace: true });
  }, [session.status, session.user, navigate, location.state]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function validContact() {
    if (channel === CHANNELS.EMAIL) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
    return /^\+[1-9]\d{7,14}$/.test(loginContact());
  }

  async function requestCode(event) {
    event.preventDefault();
    if (busy || cooldown > 0) return;
    setError('');
    if (!validContact()) { setError(channel === CHANNELS.EMAIL ? 'Nhập email hợp lệ.' : 'Nhập số điện thoại hợp lệ.'); return; }
    setBusy(true);
    try {
      const result = await session.requestLoginOtp({ channel: channel === CHANNELS.EMAIL ? 'EMAIL' : 'PHONE', contact: loginContact() });
      setChallengeId(result.challengeId); setCode(''); setStep('otp'); setCooldown(result.resendAfterSeconds ?? 60);
    } catch (requestError) { setError(messageFor(requestError)); }
    finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!/^\d{6}$/.test(code) || !challengeId) { setError('Nhập đủ 6 chữ số OTP.'); return; }
    setBusy(true);
    try {
      const result = await session.login({ challengeId, channel: channel === CHANNELS.EMAIL ? 'EMAIL' : 'PHONE', contact: loginContact(), code, rememberDevice });
      if (result?.reason === 'REGISTRATION_REQUIRED') {
        setStep('registration-required'); setCode(''); setChallengeId(''); return;
      }
      if (result?.status !== 'authenticated') {
        setStep('contact'); setCode(''); setChallengeId('');
        setError('Mã đã được xác minh nhưng tài khoản chưa thể đăng nhập. Vui lòng liên hệ hỗ trợ.'); return;
      }
      navigate(loginDestination(result.user, location.state?.from), { replace: true });
    } catch (requestError) { setError(messageFor(requestError)); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true); setError('');
    try {
      const result = await session.requestLoginOtp({ channel: channel === CHANNELS.EMAIL ? 'EMAIL' : 'PHONE', contact: loginContact() });
      setChallengeId(result.challengeId); setCode(''); setCooldown(result.resendAfterSeconds ?? 60);
    } catch (requestError) { setError(messageFor(requestError)); }
    finally { setBusy(false); }
  }

  return <section className="sign-in-page" aria-labelledby="sign-in-title">
    <img className="sign-in-paw sign-in-paw--left" src="/assets/sign-in/paw.svg" alt="" aria-hidden="true" />
    <img className="sign-in-paw sign-in-paw--right" src="/assets/sign-in/paw.svg" alt="" aria-hidden="true" />
    <div className="sign-in-card">
      <span className="sign-in-tape sign-in-tape--top" aria-hidden="true"><span className="sign-in-tape-cat">
        <img className="sign-in-tape-base" src="/assets/sign-in/cat-base.svg" alt="" />
        <span className="sign-in-tape-pattern"><img src="/assets/sign-in/cat-pattern.svg" alt="" /></span>
      </span></span>
      <span className="sign-in-tape sign-in-tape--bottom" aria-hidden="true"><span className="sign-in-tape-heart">
        <img className="sign-in-tape-base" src="/assets/sign-in/heart-base.svg" alt="" />
        <span className="sign-in-tape-pattern"><img src="/assets/sign-in/heart-pattern.svg" alt="" /></span>
      </span></span>
      <p className="sign-in-eyebrow">ĐĂNG NHẬP · PAW WORLD CARE</p>
      <h1 id="sign-in-title">Chào mừng<br />trở lại</h1>
      <p className="sign-in-description">Đăng nhập an toàn bằng mã OTP gửi tới liên hệ đã xác minh.</p>
      {step === 'registration-required' ? <div role="status">
        <p>Mã OTP đã được xác minh. Liên hệ này chưa được đăng ký tài khoản Paw World Care.</p>
        <p><Link to="/register">Đăng ký tài khoản</Link> để tiếp tục với vai trò Khách hàng hoặc ứng tuyển Pet Sitter.</p>
        <button type="button" className="sign-in-link" onClick={() => { setStep('contact'); setError(''); }}>Dùng liên hệ khác</button>
      </div> : step === 'contact' ? <form onSubmit={requestCode} noValidate>
        <fieldset className="sign-in-channel"><legend>Nhận mã bằng</legend>
          <label><input type="radio" name="channel" value="email" checked={channel === CHANNELS.EMAIL} onChange={() => changeChannel(CHANNELS.EMAIL)} disabled={busy} /> Email</label>
          <label><input type="radio" name="channel" value="phone" checked={channel === CHANNELS.PHONE} onChange={() => changeChannel(CHANNELS.PHONE)} disabled={busy} /> SMS</label>
        </fieldset>
        <label className="sign-in-field"><span>{channel === CHANNELS.EMAIL ? 'Email' : 'Số điện thoại'}</span>
          <input type={channel === CHANNELS.EMAIL ? 'email' : 'tel'} autoComplete={channel === CHANNELS.EMAIL ? 'email' : 'tel'} placeholder={channel === CHANNELS.EMAIL ? 'hello@pawworld.com' : '0912 345 678'} value={contact} onChange={event => setContact(event.target.value)} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'sign-in-error' : undefined} required />
        </label>
        {channel === CHANNELS.PHONE && <p className="sign-in-contact-hint">Dùng số đã xác minh. Chấp nhận số Việt Nam bắt đầu bằng 0 hoặc mã quốc gia +84.</p>}
        {error && <p id="sign-in-error" className="sign-in-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || cooldown > 0}>{busy ? 'Đang gửi mã…' : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi mã OTP'}</button>
      </form> : <form onSubmit={verifyCode} noValidate>
        <p className="sign-in-sent" role="status">Yêu cầu gửi mã tới <strong>{contact}</strong> đã được tiếp nhận. {channel === CHANNELS.EMAIL ? 'Vui lòng kiểm tra hộp thư và thư rác.' : 'Vui lòng kiểm tra tin nhắn SMS trên điện thoại.'}</p>
        <label className="sign-in-field"><span>Mã OTP 6 chữ số</span>
          <input className="sign-in-otp" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'sign-in-error' : undefined} required maxLength={6} />
        </label>
        {error && <p id="sign-in-error" className="sign-in-error" role="alert">{error}</p>}
        <label className="sign-in-remember"><input type="checkbox" checked={rememberDevice} onChange={event => setRememberDevice(event.target.checked)} /> Không hỏi lại trên thiết bị này trong 30 ngày</label>
        <p className="sign-in-trust-hint">Chỉ chọn trên thiết bị cá nhân. Đăng xuất hoặc tài khoản bị khóa sẽ kết thúc phiên; tài khoản quản trị vẫn giới hạn 12 giờ.</p>
        <button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Đang xác thực…' : 'Xác thực & đăng nhập'}</button>
        <div className="sign-in-actions"><button type="button" className="sign-in-link" disabled={busy} onClick={() => { setStep('contact'); setCode(''); setChallengeId(''); setError(''); }}>Đổi liên hệ</button>
          <button type="button" className="sign-in-link" onClick={resend} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}</button></div>
      </form>}
      <p className="sign-in-register">Bạn chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
    </div>
  </section>;
}
