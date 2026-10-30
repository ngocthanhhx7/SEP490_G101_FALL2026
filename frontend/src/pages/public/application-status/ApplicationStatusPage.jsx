import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Notice } from '../../../components/ui/index.js';
import './application-status.css';

const STATUS_LABELS = Object.freeze({
  PENDING: 'Đã nộp',
  UNDER_REVIEW: 'Đang xét',
  INTERVIEW: 'Phỏng vấn',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối'
});

function getData(response) {
  return response?.data ?? response;
}

function formatVietnamDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh'
  }).format(date);
}

function messageForError(error) {
  if (error?.status === 429 || error?.code === 'RATE_LIMITED' || error?.code === 'OTP_RATE_LIMITED') {
    return 'Bạn đã yêu cầu quá nhiều mã. Hãy chờ theo thời gian máy chủ thông báo rồi thử lại.';
  }
  if (error?.status === 403 || error?.code === 'FORBIDDEN') {
    return 'Không thể xác minh hồ sơ với thông tin đã nhập.';
  }
  if (error?.code === 'APPLICATION_STATUS_UNAVAILABLE' || error?.code === 'PROVIDER_UNAVAILABLE') {
    return 'Dịch vụ xác minh đang tạm thời gián đoạn. Vui lòng thử lại sau.';
  }
  return 'Không thể xác minh hồ sơ. Hãy kiểm tra mã hồ sơ và mã OTP rồi thử lại.';
}

export function ApplicationStatusPage({ api }) {
  const [applicationCode, setApplicationCode] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resendRemaining, setResendRemaining] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!challenge || resendRemaining <= 0) return undefined;
    const timer = setTimeout(() => setResendRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [challenge, resendRemaining]);

  async function requestCode(event) {
    event.preventDefault();
    const code = applicationCode.trim();
    if (!code) {
      setError('Vui lòng nhập mã hồ sơ.');
      return;
    }
    if (typeof api?.requestVerification !== 'function') {
      setError('Dịch vụ xác minh chưa được kết nối.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = getData(await api.requestVerification({ applicationCode: code }));
      if (typeof result?.challengeId !== 'string' || !Number.isSafeInteger(result.resendAfterSeconds)
        || result.resendAfterSeconds < 0) throw new Error('INVALID_STATUS_CHALLENGE');
      setApplicationCode(code);
      setChallenge(result);
      setOtp('');
      setResendRemaining(result.resendAfterSeconds);
      setNotice('Nếu mã hồ sơ hợp lệ, hướng dẫn xác minh đã được gửi đến kênh liên hệ đã đăng ký.');
    } catch (requestError) {
      setError(messageForError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (!challenge || !/^\d{6}$/.test(otp)) {
      setError('Nhập mã OTP gồm 6 chữ số.');
      return;
    }
    if (typeof api?.verifyAndReadStatus !== 'function') {
      setError('Dịch vụ xác minh chưa được kết nối.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = getData(await api.verifyAndReadStatus({
        applicationCode, challengeId: challenge.challengeId, code: otp
      }));
      if (!Object.hasOwn(STATUS_LABELS, result?.state)) throw new Error('INVALID_STATUS_RESPONSE');
      setStatus(result);
      setApplicationCode('');
      setOtp('');
      setChallenge(null);
      setResendRemaining(0);
    } catch (verificationError) {
      setError(messageForError(verificationError));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setApplicationCode('');
    setOtp('');
    setChallenge(null);
    setStatus(null);
    setResendRemaining(0);
    setError('');
    setNotice('');
  }

  const reapplyDate = status?.state === 'REJECTED' ? formatVietnamDate(status.reapplyEligibleAt) : null;
  const submittedDate = status ? formatVietnamDate(status.submittedAt) : null;

  return <div className="application-status">
    <section className="application-status__panel" aria-labelledby="application-status-title">
      <p className="application-status__eyebrow">Paw World Care</p>
      <h1 id="application-status-title">Theo dõi hồ sơ ứng tuyển</h1>
      <p className="application-status__intro">
        Dùng mã hồ sơ và mã OTP gửi tới kênh liên hệ đã đăng ký. Mã hồ sơ không đủ để xem thông tin hồ sơ.
      </p>

      {error && <Notice state="error" title="Chưa thể hoàn tất xác minh">{error}</Notice>}
      {notice && <Notice state="pending" title="Yêu cầu đang chờ xác minh">{notice}</Notice>}
      {busy && <Notice state="loading" title="Đang xác minh">Vui lòng chờ trong giây lát.</Notice>}

      {!status && !challenge && <>
        <Notice state="empty" title="Chưa có thông tin tra cứu">
          Nhập mã hồ sơ để bắt đầu xác minh. Không nhập số giấy tờ hoặc thông tin cá nhân khác.
        </Notice>
        <form className="application-status__form" onSubmit={requestCode} noValidate>
          <Input label="Mã hồ sơ" name="applicationCode" autoComplete="off" required maxLength={128}
            value={applicationCode} onChange={event => setApplicationCode(event.target.value)} />
          <Button type="submit" loading={busy} loadingLabel="Đang gửi yêu cầu…" className="application-status__button">
            Gửi mã xác minh
          </Button>
        </form>
      </>}

      {!status && challenge && <>
        <form className="application-status__form" onSubmit={verifyCode} noValidate>
          <Input label="Mã OTP gồm 6 chữ số" name="otp" type="text" inputMode="numeric" pattern="[0-9]{6}"
            autoComplete="one-time-code" maxLength={6} required value={otp}
            onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          <Button type="submit" loading={busy} loadingLabel="Đang kiểm tra…" className="application-status__button">
            Xác minh và xem trạng thái
          </Button>
        </form>
        <div className="application-status__actions">
          <Button type="button" variant="secondary" disabled={busy || resendRemaining > 0}
            onClick={requestCode}>
            {resendRemaining > 0 ? `Gửi lại mã sau ${resendRemaining} giây` : 'Gửi lại mã xác minh'}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={startOver}>Đổi mã hồ sơ</Button>
        </div>
      </>}

      {status && <section className="application-status__result" aria-live="polite" aria-labelledby="application-status-result-title">
        <h2 id="application-status-result-title">Trạng thái hồ sơ</h2>
        <p className="application-status__state">{STATUS_LABELS[status.state]}</p>
        {submittedDate && <p>Ngày nộp: <time dateTime={status.submittedAt}>{submittedDate}</time></p>}
        {status.state === 'APPROVED' && <p>Hồ sơ đã được duyệt. <Link to="/sign-in">Đăng nhập bằng email đã xác minh</Link> để sử dụng quyền Pet Sitter.</p>}
        {status.state === 'REJECTED' && <>
          <div className="application-status__reason">
            <h3>Lý do từ chối</h3>
            <p>{status.rejectionReason || 'Chưa có nội dung lý do được cung cấp.'}</p>
          </div>
          {reapplyDate && <p>
            {status.canReapply ? 'Bạn đã đủ điều kiện nộp lại.' : 'Bạn có thể nộp lại từ '}
            {!status.canReapply && <time dateTime={status.reapplyEligibleAt}>{reapplyDate}</time>}
          </p>}
          {status.canReapply === true && <Link to="/register?role=sitter">Nộp lại hồ sơ ứng tuyển →</Link>}
        </>}
        <Button type="button" variant="secondary" onClick={startOver}>Tra cứu hồ sơ khác</Button>
      </section>}
    </section>
  </div>;
}
