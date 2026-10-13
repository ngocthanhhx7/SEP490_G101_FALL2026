const env = require('../config/env');
const { sendOtpEmail } = require('../services/emailService');
const { createOtpService } = require('../services/otpService');

const otpService = createOtpService({
  sendEmail: sendOtpEmail,
  secret: env.otpHmacSecret,
  ttlSeconds: env.otpTtlSeconds,
  maxAttempts: env.otpMaxAttempts,
  resendCooldownSeconds: env.resendCooldownSeconds,
});

function handleError(error, res) {
  const statuses = {
    INVALID_EMAIL: 400,
    RESEND_TOO_SOON: 429,
    OTP_EXPIRED: 400,
    OTP_INVALID: 400,
    OTP_ATTEMPTS_EXHAUSTED: 429,
  };
  res.status(statuses[error.code] || 500).json({
    code: error.code || 'OTP_DELIVERY_FAILED',
    message: error.message,
    ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    ...(error.attemptsRemaining !== undefined ? { attemptsRemaining: error.attemptsRemaining } : {}),
  });
}

async function requestOtp(req, res) {
  try {
    const result = await otpService.issue(req.body?.email);
    res.json({ message: 'OTP sent.', expiresInSeconds: result.expiresInSeconds });
  } catch (error) {
    handleError(error, res);
  }
}

async function resendOtp(req, res) {
  try {
    const result = await otpService.issue(req.body?.email, { isResend: true });
    res.json({ message: 'OTP resent.', expiresInSeconds: result.expiresInSeconds });
  } catch (error) {
    handleError(error, res);
  }
}

function verifyOtp(req, res) {
  try {
    otpService.verify(req.body?.email, req.body?.otp);
    res.json({ verified: true, message: 'Đăng nhập thành công.' });
  } catch (error) {
    handleError(error, res);
  }
}

module.exports = { requestOtp, resendOtp, verifyOtp };
