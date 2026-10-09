import { AppError } from '../errors/app-error.js';
import { config } from '../config/env.js';

export class TimeoutOtpProvider {
  constructor(sender, timeoutMs = config.providerTimeoutMs) {
    if (typeof sender !== 'function') throw new TypeError('Provider sender must be a function');
    this.sender = sender;
    this.timeoutMs = timeoutMs;
  }

  async sendOtp(destination, otp) {
    const controller = new AbortController();
    let timeout;
    try {
      await Promise.race([
        this.sender({ destination, otp, signal: controller.signal }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('provider timeout'));
          }, this.timeoutMs);
        }),
      ]);
    } catch {
      throw new AppError('OTP_DELIVERY_FAILED', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class EmailProvider extends TimeoutOtpProvider {}
export class SmsProvider extends TimeoutOtpProvider {}
