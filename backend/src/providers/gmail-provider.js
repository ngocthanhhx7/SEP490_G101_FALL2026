import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { TimeoutOtpProvider } from './timeout-provider.js';

export class GmailOtpProvider extends TimeoutOtpProvider {
  constructor() {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmailUser,
        pass: config.gmailAppPassword,
      },
      connectionTimeout: config.providerTimeoutMs,
      greetingTimeout: config.providerTimeoutMs,
      socketTimeout: config.providerTimeoutMs,
    });

    super(async ({ destination, otp }) => {
      const result = await transporter.sendMail({
        from: config.emailFrom,
        to: destination,
        subject: 'Your Paw World Care verification code',
        text: `Your verification code is ${otp}. It expires in ${Math.ceil(config.otpTtlMs / 60_000)} minutes. Do not share this code.`,
      });
      if (!result.accepted?.includes(destination)) throw new Error('Gmail did not accept the recipient');
    });
  }
}
