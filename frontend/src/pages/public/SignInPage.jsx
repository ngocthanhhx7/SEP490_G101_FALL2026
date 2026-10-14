import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import './sign-in.css';

const CHANNELS = { EMAIL: 'email', PHONE: 'phone' };

function messageFor(error) {
  const messages = {
    OTP_RATE_LIMITED: 'Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.',
    OTP_INVALID_OR_EXPIRED: 'Mã OTP không đúng hoặc đã hết hạn.',
    VALIDATION_FAILED: 'Thông tin đăng nhập chưa đúng định dạng.',
    NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
    TIMEOUT: 'Kết nối quá thời gian. Vui lòng thử lại.',
    LOGIN_NOT_AVAILABLE: 'Đăng nhập chưa được kết nối trong phiên này.',
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

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function validContact() {
    if (channel === CHANNELS.EMAIL) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
    return /^\+?[0-9][0-9 ()-]{7,19}$/.test(contact.trim());
  }

  async function requestCode(event) {
    event.preventDefault();
    setError('');
    if (!validContact()) { setError(channel === CHANNELS.EMAIL ? 'Nhập email hợp lệ.' : 'Nhập số điện thoại hợp lệ.'); return; }
    setBusy(true);
    try {
      const result = await session.requestLoginOtp({ channel: channel === CHANNELS.EMAIL ? 'EMAIL' : 'PHONE', contact: contact.trim() });
      setChallengeId(result.challengeId); setCode(''); setStep('otp'); setCooldown(result.resendAfterSeconds ?? 60);
    } catch (requestError) { setError(messageFor(requestError)); }
    finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code) || !challengeId) { setError('Nhập đủ 6 chữ số OTP.'); return; }
    setBusy(true);
    try {
      const result = await session.login({ challengeId, channel: channel === CHANNELS.EMAIL ? 'EMAIL' : 'PHONE', contact: contact.trim(), code });
      if (result?.status !== 'authenticated') { setError('Thông tin chưa được xác thực.'); return; }
      navigate(location.state?.from || '/account', { replace: true });
    } catch (requestError) { setError(messageFor(requestError)); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true); setError('');
    try {
      const result = await session.requestLoginOtp({ channel: channel === CHANNELS.EMAIL ? 'EMAIL' : 'PHONE', contact: contact.trim() });
      setChallengeId(result.challengeId); setCooldown(result.resendAfterSeconds ?? 60);
    } catch (requestError) { setError(messageFor(requestError)); }
    finally { setBusy(false); }
  }

  return <section className="sign-in-page" aria-labelledby="sign-in-title">
    <div className="sign-in-card">
      <p className="sign-in-eyebrow">PAW WORLD CARE</p>
      <h1 id="sign-in-title">Đăng nhập</h1>
      <p className="sign-in-description">Đăng nhập an toàn bằng mã OTP gửi tới liên hệ đã xác minh.</p>
      {step === 'contact' ? <form onSubmit={requestCode} noValidate>
        <fieldset className="sign-in-channel"><legend>Nhận mã bằng</legend>
          <label><input type="radio" name="channel" value="email" checked={channel === CHANNELS.EMAIL} onChange={() => setChannel(CHANNELS.EMAIL)} /> Email</label>
          <label><input type="radio" name="channel" value="phone" checked={channel === CHANNELS.PHONE} onChange={() => setChannel(CHANNELS.PHONE)} /> Điện thoại</label>
        </fieldset>
        <label className="sign-in-field"><span>{channel === CHANNELS.EMAIL ? 'Email' : 'Số điện thoại'}</span>
          <input autoComplete={channel === CHANNELS.EMAIL ? 'email' : 'tel'} value={contact} onChange={event => setContact(event.target.value)} required />
        </label>
        {error && <p className="sign-in-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Đang gửi mã…' : 'Gửi mã OTP'}</button>
      </form> : <form onSubmit={verifyCode} noValidate>
        <p className="sign-in-sent">Mã đã gửi tới <strong>{contact}</strong>.</p>
        <label className="sign-in-field"><span>Mã OTP 6 chữ số</span>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required maxLength={6} />
        </label>
        {error && <p className="sign-in-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Đang xác thực…' : 'Xác thực & đăng nhập'}</button>
        <div className="sign-in-actions"><button type="button" className="sign-in-link" onClick={() => { setStep('contact'); setCode(''); setError(''); }}>Đổi liên hệ</button>
          <button type="button" className="sign-in-link" onClick={resend} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}</button></div>
      </form>}
    </div>
  </section>;
}
