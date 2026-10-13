const crypto = require('node:crypto');

const GMAIL_PATTERN = /^[^\s@]+@gmail\.com$/i;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidGmail(email) {
  return GMAIL_PATTERN.test(normalizeEmail(email));
}

function hashOtp(otp, secret) {
  return crypto.createHmac('sha256', secret).update(otp).digest('hex');
}

function createOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function createOtpService({ sendEmail, secret, ttlSeconds = 300, maxAttempts = 5, resendCooldownSeconds = 60, now = () => Date.now() }) {
  const pending = new Map();

  async function issue(email, { isResend = false } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!isValidGmail(normalizedEmail)) {
      const error = new Error('Email must use the format name@gmail.com.');
      error.code = 'INVALID_EMAIL';
      throw error;
    }

    const current = pending.get(normalizedEmail);
    if (isResend && current && now() - current.sentAt < resendCooldownSeconds * 1000) {
      const error = new Error('Please wait before requesting another OTP.');
      error.code = 'RESEND_TOO_SOON';
      error.retryAfterSeconds = Math.ceil((resendCooldownSeconds * 1000 - (now() - current.sentAt)) / 1000);
      throw error;
    }

    const otp = createOtp();
    const record = {
      hash: hashOtp(otp, secret),
      expiresAt: now() + ttlSeconds * 1000,
      sentAt: now(),
      attempts: 0,
    };

    await sendEmail(normalizedEmail, otp);
    pending.set(normalizedEmail, record);
    return { email: normalizedEmail, expiresInSeconds: ttlSeconds };
  }

  function verify(email, otp) {
    const normalizedEmail = normalizeEmail(email);
    const record = pending.get(normalizedEmail);
    if (!record || now() > record.expiresAt) {
      pending.delete(normalizedEmail);
      const error = new Error('OTP has expired or is invalid.');
      error.code = 'OTP_EXPIRED';
      throw error;
    }

    if (!/^\d{6}$/.test(otp) || !crypto.timingSafeEqual(Buffer.from(record.hash), Buffer.from(hashOtp(otp, secret)))) {
      record.attempts += 1;
      if (record.attempts >= maxAttempts) pending.delete(normalizedEmail);
      const error = new Error(record.attempts >= maxAttempts ? 'Maximum OTP attempts reached.' : 'OTP is incorrect.');
      error.code = record.attempts >= maxAttempts ? 'OTP_ATTEMPTS_EXHAUSTED' : 'OTP_INVALID';
      error.attemptsRemaining = Math.max(maxAttempts - record.attempts, 0);
      throw error;
    }

    pending.delete(normalizedEmail);
    return { verified: true };
  }

  return { issue, verify, size: () => pending.size };
}

module.exports = { createOtpService, isValidGmail, normalizeEmail };
