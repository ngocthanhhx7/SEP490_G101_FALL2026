const dotenv = require('dotenv');

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS || process.env.OTP_TTL || 300),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || process.env.MAX_WRONG_OTP || 5),
  resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || process.env.RESEND_COOLDOWN || 60),
  otpHmacSecret: required('OTP_HMAC_SECRET'),
  gmailUser: required('GMAIL_USER'),
  gmailAppPassword: required('GMAIL_APP_PASSWORD'),
  emailFrom: process.env.EMAIL_FROM || process.env.GMAIL_USER,
};
