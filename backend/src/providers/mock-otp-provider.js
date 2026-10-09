import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const deliveredCodes = new Map();

export class MockOtpProvider {
  async sendOtp(destination, otp) {
    if (!['development', 'test'].includes(config.nodeEnv)) {
      throw new AppError('OTP_DELIVERY_FAILED', 502);
    }
    deliveredCodes.set(destination, otp);
  }
}

export function readMockOtp(destination) {
  return deliveredCodes.get(destination);
}

export function clearMockOtps() {
  deliveredCodes.clear();
}
