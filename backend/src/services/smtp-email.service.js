import { AppError } from '../utils/app-error.js';
import { loadSmtpConfig } from '../config/smtp.js';
export { loadSmtpConfig } from '../config/smtp.js';
import { createEmailDelivery } from './email-delivery.service.js';

// P34 injects nodemailer.createTransport and installs its exact manifest/lockfile dependency.
export function createEmailPortOverrides({
  env = process.env,
  createTransport,
  clock,
  sleep,
  logger
} = {}) {
  const config = loadSmtpConfig(env);
  if (!config) return {}; // P02 defaults continue to throw PROVIDER_UNAVAILABLE (503).
  if (typeof createTransport !== 'function')
    throw new AppError(
      503,
      'EMAIL_TRANSPORT_UNAVAILABLE',
      'Email transport is not installed or injected'
    );
  const delivery = createEmailDelivery({
    ...config,
    clock,
    sleep,
    logger,
    createAttempt: () => createTransport(config.options)
  });
  const port = (kind) =>
    Object.freeze({
      send: (command) =>
        command?.kind === kind
          ? delivery.send(command)
          : Promise.resolve({
              status: 'FAILED',
              code: 'INVALID_REQUEST',
              retryable: false,
              uncertain: false,
              attempts: 0
            })
    });
  return { contactDelivery: port('OTP'), notificationDelivery: port('SYSTEM') };
}
