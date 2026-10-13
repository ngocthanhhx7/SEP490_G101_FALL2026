const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: env.gmailUser, pass: env.gmailAppPassword },
});

async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: env.emailFrom,
    to,
    subject: 'Paw World Care - mã OTP đăng nhập',
    text: `Mã OTP đăng nhập của bạn là ${otp}. Mã có hiệu lực trong ${env.otpTtlSeconds / 60} phút.`,
  });
}

module.exports = { sendOtpEmail };
