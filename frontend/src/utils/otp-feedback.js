const VIETNAM_CLOCK = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const MESSAGES = Object.freeze({
  OTP_INCORRECT: 'Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.',
  OTP_EXPIRED: 'Mã OTP đã hết hạn sau 5 phút. Vui lòng yêu cầu mã mới.',
  OTP_ALREADY_USED: 'Mã OTP này đã được sử dụng. Vui lòng yêu cầu mã mới.',
  OTP_REPLACED: 'Bạn đã yêu cầu mã mới. Vui lòng dùng mã trong email hoặc SMS mới nhất.',
  OTP_INVALID_OR_EXPIRED: 'Không thể xác thực mã này. Vui lòng dùng mã mới nhất hoặc yêu cầu gửi lại.',
  OTP_DELIVERY_UNAVAILABLE: 'Chưa thể gửi mã OTP. Vui lòng thử lại sau.',
  OTP_RATE_LIMITED: 'Bạn đã yêu cầu mã quá nhanh. Vui lòng thử lại sau.',
  RATE_LIMITED: 'Bạn đã vượt quá số lần thử cho phép. Vui lòng thử lại sau.',
  PROVIDER_UNAVAILABLE: 'Dịch vụ gửi mã OTP đang tạm gián đoạn. Vui lòng thử lại sau.',
});

function formatRetryTime(error, now = Date.now()) {
  let targetMs = Number.NaN;
  if (typeof error?.retryAfterAt === 'string') {
    targetMs = Date.parse(error.retryAfterAt);
  } else if (Number.isSafeInteger(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) {
    targetMs = now + error.retryAfterSeconds * 1000;
  }
  if (!Number.isFinite(targetMs)) return null;
  const parts = Object.fromEntries(
    VIETNAM_CLOCK.formatToParts(new Date(targetMs)).map(part => [part.type, part.value])
  );
  return parts.hour && parts.minute ? `${parts.hour}:${parts.minute}` : null;
}

export function otpFeedback(errorOrCode, { now } = {}) {
  if (typeof errorOrCode === 'string') return MESSAGES[errorOrCode] ?? null;
  const code = errorOrCode?.code;
  if (typeof code !== 'string') return null;

  if (code === 'OTP_INCORRECT') {
    if (Number.isSafeInteger(errorOrCode.remainingAttempts) && errorOrCode.remainingAttempts > 0) {
      return `Mã không đúng. Bạn còn ${errorOrCode.remainingAttempts} lần thử.`;
    }
    return MESSAGES.OTP_INCORRECT;
  }

  if (code === 'OTP_RATE_LIMITED' || code === 'RATE_LIMITED') {
    const retryTime = formatRetryTime(errorOrCode, now);
    if (errorOrCode.reason === 'TOO_MANY_WRONG_CODES') {
      return retryTime
        ? `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${retryTime}.`
        : 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.';
    }
    if (errorOrCode.reason === 'HOURLY_LIMIT') {
      return retryTime
        ? `Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau ${retryTime}.`
        : 'Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.';
    }
    if (errorOrCode.reason === 'RESEND_COOLDOWN') {
      return Number.isSafeInteger(errorOrCode.retryAfterSeconds) && errorOrCode.retryAfterSeconds > 0
        ? `Vui lòng chờ ${errorOrCode.retryAfterSeconds} giây trước khi yêu cầu mã mới.`
        : 'Vui lòng chờ một lúc trước khi yêu cầu mã mới.';
    }
    return null;
  }

  return MESSAGES[code] ?? null;
}
