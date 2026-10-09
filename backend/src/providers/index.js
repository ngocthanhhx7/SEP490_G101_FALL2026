import { config } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { MockOtpProvider } from './mock-otp-provider.js';
import { GmailOtpProvider } from './gmail-provider.js';
import { EsmsOtpProvider } from './esms-provider.js';

const mockProvider = new MockOtpProvider();
let providers = {
  email: config.otpEmailProvider === 'gmail' ? new GmailOtpProvider() : mockProvider,
  phone: config.otpSmsProvider === 'esms' ? new EsmsOtpProvider() : mockProvider,
};

export function configureOtpProviders(nextProviders) {
  if (!nextProviders?.email || !nextProviders?.phone) {
    throw new TypeError('Both email and phone OTP providers are required');
  }
  providers = nextProviders;
}

export function getOtpProvider(contactType) {
  const provider = providers[contactType];
  if (!provider || typeof provider.sendOtp !== 'function') {
    throw new AppError('OTP_DELIVERY_FAILED', 502);
  }
  if (config.nodeEnv === 'production' && provider instanceof MockOtpProvider) {
    throw new AppError('OTP_DELIVERY_FAILED', 502);
  }
  return provider;
}
