const MESSAGES = Object.freeze({
  OTP_INCORRECT: 'Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.',
  OTP_EXPIRED: 'Mã OTP đã hết hạn sau 5 phút. Vui lòng yêu cầu mã mới.',
  OTP_ALREADY_USED: 'Mã OTP này đã được sử dụng. Vui lòng yêu cầu mã mới.',
  OTP_REPLACED: 'Bạn đã yêu cầu mã mới. Vui lòng dùng mã trong email hoặc SMS mới nhất.',
  OTP_INVALID_OR_EXPIRED: 'Không thể xác thực mã này. Vui lòng dùng mã mới nhất hoặc yêu cầu gửi lại.',
  OTP_DELIVERY_UNAVAILABLE: 'Chưa thể gửi mã OTP. Vui lòng thử lại sau.',
});

export function otpFeedback(code) {
  return MESSAGES[code] ?? null;
}
