import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { otpFeedback } from '../../utils/otp-feedback.js';
import { useRegistrationPolicies } from '../../contexts/PublicPolicyContext.jsx';
import { customerRegistrationApi, normalizeDisplayName, normalizeRegistrationContact } from '../../services/customer-registration-api.js';
import { PolicyContextLinks } from './policies/PolicyLinks.jsx';
import './customer-registration.css';

const OTP_LIFETIME_SECONDS = 300;
const RESEND_SECONDS = 60;

function formatTimer(seconds) {
  const safeSeconds = Math.max(0, seconds);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function messageForError(error) {
  if (!error || typeof error.code !== 'string') return 'Không thể hoàn tất đăng ký. Vui lòng thử lại.';
  if (error.code === 'PROVIDER_UNAVAILABLE') return 'Chưa thể gửi mã xác minh. Hãy thử lại sau.';
  if (error.code === 'OTP_RATE_LIMITED' || error.code === 'RATE_LIMITED') {
    const wait = Number.isSafeInteger(error.retryAfterSeconds) ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : '';
    return `Bạn đã yêu cầu mã quá nhanh.${wait}`;
  }
  if (otpFeedback(error.code)) return otpFeedback(error.code);
  if (error.code === 'CONTACT_ALREADY_LINKED' || error.code === 'CONTACT_UNAVAILABLE') {
    return 'Thông tin liên hệ này không thể dùng để đăng ký. Hãy đăng nhập bằng OTP nếu bạn đã có tài khoản.';
  }
  if (error.code === 'FORBIDDEN') return 'Yêu cầu này không được phép. Hãy tải lại trang và thử lại.';
  if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
    return 'Không nhận được xác nhận từ máy chủ. Đừng gửi lại liên tục; hãy kiểm tra phiên hoặc bắt đầu lại bằng OTP.';
  }
  if (error.code === 'REGISTRATION_NOT_COMPLETED' || error.code === 'REGISTRATION_UNAVAILABLE') {
    return 'Luồng đăng ký chưa sẵn sàng. Chưa có tài khoản hoặc phiên đăng nhập nào được xác nhận.';
  }
  return 'Không thể hoàn tất đăng ký lúc này. Vui lòng thử lại sau.';
}

function validateName(value) {
  const name = normalizeDisplayName(value);
  if (!name) return 'Vui lòng nhập họ và tên.';
  if (name.length > 100) return 'Họ và tên không được dài quá 100 ký tự.';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Họ và tên chứa ký tự không hợp lệ.';
  return '';
}

export function CustomerRegistrationPage({ api = customerRegistrationApi, intent = 'CUSTOMER', onVerified, onPhaseChange }) {
  const { refresh } = useSession();
  const policies = useRegistrationPolicies();
  const [displayName, setDisplayName] = useState('');
  const channel = 'EMAIL';
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [agreement, setAgreement] = useState(false);
  const [agreementKey, setAgreementKey] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [completed, setCompleted] = useState(null);
  const [phase, setPhase] = useState('details');
  const nameRef = useRef(null);
  const contactRef = useRef(null);
  const codeRef = useRef(null);
  const agreementRef = useRef(null);

  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  useEffect(() => { setAgreement(false); }, [policies.key]);

  useEffect(() => {
    if (!challenge) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const sameChallenge = challenge?.channel === channel && challenge?.contact === contact;
  const secondsRemaining = sameChallenge ? Math.ceil((challenge.expiresAt - now) / 1000) : 0;
  const resendRemaining = sameChallenge ? Math.ceil((challenge.resendAt - now) / 1000) : 0;
  const canResend = !busy && (!sameChallenge || resendRemaining <= 0);

  function clearNotice() {
    setNotice(null);
    setErrors({});
  }

  function changeContact(next) {
    setContact(next);
    setChallenge(null);
    setCode('');
    clearNotice();
  }

  function focusInvalid(nextErrors) {
    const first = nextErrors.displayName ? nameRef : nextErrors.contact ? contactRef : nextErrors.code
      ? codeRef : nextErrors.agreement ? agreementRef : null;
    first?.current?.focus();
  }

  function validateContact() {
    const nextErrors = {};
    const nameError = validateName(displayName);
    const normalizedContact = normalizeRegistrationContact(channel, contact);
    if (nameError) nextErrors.displayName = nameError;
    if (!normalizedContact) nextErrors.contact = channel === 'EMAIL'
      ? 'Nhập địa chỉ email hợp lệ.' : 'Nhập số điện thoại hợp lệ, ví dụ 0912345678.';
    return { nextErrors, normalizedContact };
  }

  async function requestOtp() {
    if (busy || !policies.current().ready) return;
    const { nextErrors, normalizedContact } = validateContact();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setNotice(null);
      focusInvalid(nextErrors);
      return;
    }
    if (!canResend) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.requestOtp({ channel, contact: normalizedContact });
      const startedAt = Date.now();
      setContact(normalizedContact);
      setChallenge({
        challengeId: result.challengeId,
        channel,
        contact: normalizedContact,
        expiresAt: startedAt + Math.min(result.expiresInSeconds || OTP_LIFETIME_SECONDS, OTP_LIFETIME_SECONDS) * 1000,
        resendAt: startedAt + Math.max(result.resendAfterSeconds || RESEND_SECONDS, RESEND_SECONDS) * 1000,
      });
      setNow(startedAt);
      setPhase('otp');
      setCode('');
      setErrors({});
      setNotice({ state: 'pending', title: 'Đang chờ xác nhận gửi mã',
        message: 'Yêu cầu đã được tiếp nhận. Trạng thái gửi email/tin nhắn chưa được xác nhận; mã có hiệu lực 5 phút nếu nhà cung cấp tiếp nhận.' });
    } catch (error) {
      setNotice({ state: error?.code === 'FORBIDDEN' ? 'forbidden' : 'error',
        title: error?.code === 'FORBIDDEN' ? 'Không thể tiếp tục' : 'Chưa gửi được mã', message: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    if (busy) return;
    const currentPolicies = policies.current();
    if (!currentPolicies.ready) {
      setNotice({ state: 'error', title: 'Chính sách chưa sẵn sàng',
        message: 'Đăng ký sẽ mở khi Điều khoản dịch vụ và Chính sách quyền riêng tư có hiệu lực.' });
      return;
    }
    const { nextErrors, normalizedContact } = validateContact();
    if (!sameChallenge || !challenge) nextErrors.challenge = 'Hãy yêu cầu mã OTP trước khi đăng ký.';
    if (!/^\d{6}$/.test(code)) nextErrors.code = 'Nhập mã OTP gồm đúng 6 chữ số.';
    if (!agreement || agreementKey !== currentPolicies.key) nextErrors.agreement = 'Bạn cần xác nhận đồng ý để tiếp tục.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setNotice(null);
      focusInvalid(nextErrors);
      return;
    }
    if (secondsRemaining <= 0) {
      setNotice({ state: 'error', title: 'Mã OTP đã hết hạn', message: 'Gửi mã mới để tiếp tục xác minh.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.verifyAndRegister({
        challengeId: challenge.challengeId,
        channel,
        contact: normalizedContact,
        code,
        displayName: normalizeDisplayName(displayName),
        policyVersions: currentPolicies.versions,
      });
      setCompleted(result.user?.displayName || normalizeDisplayName(displayName));
      setChallenge(null);
      setCode('');
      setErrors({});
      refresh();
      onVerified?.({ displayName: normalizeDisplayName(displayName), contact: normalizedContact, user: result.user });
    } catch (error) {
      setNotice({ state: error?.code === 'FORBIDDEN' ? 'forbidden' : 'error',
        title: error?.code === 'FORBIDDEN' ? 'Không thể tiếp tục' : 'Chưa hoàn tất đăng ký', message: messageForError(error) });
    } finally {
      setBusy(false);
    }
  }

  const contactType = channel === 'EMAIL' ? 'email' : 'tel';
  const contactLabel = channel === 'EMAIL' ? 'Email' : 'Số điện thoại';
  function continueRegistration(event) {
    event.preventDefault();
    if (!policies.current().ready) {
      setNotice({ state: 'error', title: 'Chính sách chưa sẵn sàng', message: 'Cần Điều khoản và Chính sách quyền riêng tư được phê duyệt, có hiệu lực trước khi đăng ký.' });
      return;
    }
    const { nextErrors } = validateContact();
    if (!agreement || agreementKey !== policies.current().key) nextErrors.agreement = 'Bạn cần xác nhận đồng ý để tiếp tục.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusInvalid(nextErrors); return; }
    requestOtp();
  }

  if (completed) {
    return <section className="customer-registration" aria-labelledby="registration-success-title">
      <div className="registration-card registration-card--success">
        <p className="registration-eyebrow">PawWorld · {intent === 'PET_SITTER' ? 'Ứng tuyển Pet Sitter' : 'Khách hàng'}</p>
        <h1 id="registration-success-title">Đăng ký thành công!</h1>
        <p className="registration-intro">Chào mừng {completed} đến với gia đình PawWorld.</p>
        <div className="registration-notice registration-notice--success" role="status">
          Tài khoản Customer đã được tạo và phiên đăng nhập đã mở trên thiết bị này.
        </div>
        <Link className="registration-submit" to="/">Về trang chủ <span aria-hidden="true">→</span></Link>
      </div>
    </section>;
  }

  return <section className="customer-registration" aria-labelledby="registration-title">
    <div className="registration-card">
      <span className="registration-tape registration-tape--top" aria-hidden="true" />
      <span className="registration-tape registration-tape--bottom" aria-hidden="true" />
      <header className="registration-header">
        <p className="registration-eyebrow">PawWorld · {intent === 'PET_SITTER' ? 'Ứng tuyển Pet Sitter' : 'Khách hàng'}</p>
        <h2 id="registration-title">{phase === 'otp' ? 'Xác minh email của bạn' : 'Đăng ký tài khoản mới'}</h2>
        <p className="registration-intro">{phase === 'otp' ? 'Chỉ một bước nữa để bắt đầu đồng hành cùng PawWorld.' : 'Điền thông tin bên dưới để bắt đầu. Bạn sẽ đăng nhập bằng mã OTP.'}</p>
      </header>

      <form className="registration-form" noValidate onSubmit={phase === 'details' ? continueRegistration : submitRegistration}>
        <div className="registration-details-grid">
        <div className="registration-field">
          <label htmlFor="registration-name">Họ và tên của bạn</label>
          <input ref={nameRef} id="registration-name" name="displayName" autoComplete="name" required
            value={displayName} maxLength={100} placeholder="Nguyễn Văn A" disabled={busy} readOnly={Boolean(challenge)}
            aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? 'registration-name-error' : undefined}
            onChange={event => { setDisplayName(event.target.value); clearNotice(); }} />
          {errors.displayName && <span id="registration-name-error" className="registration-field-error">{errors.displayName}</span>}
        </div>

        <fieldset className="registration-contact-fieldset">
          <legend>Email đăng ký</legend>
          <input ref={contactRef} id="registration-contact" name="contact" type={contactType}
            autoComplete={channel === 'EMAIL' ? 'email' : 'tel'} inputMode={channel === 'PHONE' ? 'tel' : undefined}
            value={contact} disabled={busy} required readOnly={Boolean(challenge)} placeholder={channel === 'EMAIL' ? 'hello@pawworld.com' : '+84 912 345 678'}
            aria-label={contactLabel} aria-invalid={Boolean(errors.contact)}
            aria-describedby={errors.contact ? 'registration-contact-error' : 'registration-contact-hint'}
            onChange={event => changeContact(event.target.value)} />
          {errors.contact && <span id="registration-contact-error" className="registration-field-error">{errors.contact}</span>}
          {!errors.contact && <span id="registration-contact-hint" className="registration-hint">
            {channel === 'EMAIL' ? 'Mã sẽ được gửi đến email này.' : 'Nhập số Việt Nam hoặc số quốc tế có mã vùng.'}
          </span>}
          {challenge && <button className="registration-text-button" type="button" disabled={busy} onClick={() => {
            setChallenge(null); setCode(''); setPhase('details'); clearNotice();
          }}>Thay đổi thông tin liên hệ</button>}
        </fieldset>
        </div>

        {phase === 'otp' && <section className="registration-otp" aria-labelledby="registration-otp-title">
          <div className="registration-otp-heading">
            <h2 id="registration-otp-title">Mã xác thực OTP (6 chữ số)</h2>
            {sameChallenge && <span className="registration-countdown" aria-label={`Mã còn hiệu lực ${formatTimer(secondsRemaining)}`}>
              <span aria-hidden="true">◷</span> Hiệu lực trong {formatTimer(secondsRemaining)}
            </span>}
          </div>
          <div className="registration-otp-row">
            <input ref={codeRef} id="registration-code" name="code" type="text" inputMode="numeric"
              autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy}
              placeholder="•  •  •  •  •  •" aria-label="Mã OTP gồm 6 chữ số"
              aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'registration-code-error' : 'registration-code-hint'}
              onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); clearNotice(); }} />
            <button className="registration-send" type="button" aria-busy={busy}
              onClick={requestOtp} disabled={busy || !canResend || !policies.ready}>{busy ? 'Đang gửi…' : sameChallenge && resendRemaining > 0
                ? `Gửi lại sau ${formatTimer(resendRemaining)}` : sameChallenge ? 'Gửi lại mã OTP' : 'Gửi mã OTP'}</button>
          </div>
          {errors.code && <span id="registration-code-error" className="registration-field-error">{errors.code}</span>}
          {!errors.code && <span id="registration-code-hint" className="registration-hint">
            🔒 Mã OTP dùng một lần, hết hạn sau 5 phút. Tối đa 5 mã mỗi giờ; hãy chờ ít nhất 60 giây giữa các lần gửi.
          </span>}
          {errors.challenge && <span className="registration-field-error" role="alert">{errors.challenge}</span>}
          {secondsRemaining <= 0 && sameChallenge && <span className="registration-hint">Mã đã hết hạn. Bạn có thể yêu cầu mã mới.</span>}
        </section>}

        <div className="registration-consent">
          <input ref={agreementRef} id="registration-agreement" type="checkbox" checked={agreement} disabled={busy || !policies.ready}
            aria-invalid={Boolean(errors.agreement)} aria-describedby={errors.agreement ? 'registration-agreement-error' : undefined}
            onChange={event => { setAgreement(event.target.checked); setAgreementKey(policies.current().key); clearNotice(); }} />
          <label htmlFor="registration-agreement">Tôi đồng ý với các chính sách áp dụng của Paw World Care.</label>
          <PolicyContextLinks context="registration" />
          {!policies.ready && <p role="status">Đăng ký sẽ mở khi hai chính sách được phê duyệt và có hiệu lực.</p>}
          {errors.agreement && <span id="registration-agreement-error" className="registration-field-error">{errors.agreement}</span>}
        </div>

        {notice && <div className={`registration-notice registration-notice--${notice.state}`}
          role={notice.state === 'error' || notice.state === 'forbidden' ? 'alert' : 'status'}>
          <strong>{notice.title}</strong><span>{notice.message}</span>
        </div>}

        <button className="registration-submit" type="submit" disabled={busy || !policies.ready} aria-busy={busy}>
          {busy ? 'Đang xử lý…' : phase === 'details' ? 'Đăng ký' : 'Xác thực & hoàn tất đăng ký'} <span aria-hidden="true">→</span>
        </button>
      </form>

      <footer className="registration-footer">
        <p>Đã có tài khoản PawWorld? <Link to="/sign-in">Đăng nhập bằng mã OTP</Link></p>
      </footer>
    </div>
  </section>;
}
