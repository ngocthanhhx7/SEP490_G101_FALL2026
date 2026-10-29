import { loadEsmsConfig } from '../config/esms.js';
export { loadEsmsConfig } from '../config/esms.js';
import { createSmsDelivery } from './sms-delivery.service.js';

// P34 composes this channel-specific contactDelivery with P11 and dispatches by command.channel.
export function createSmsPortOverrides({
  env = process.env,
  fetchImpl,
  clock,
  logger
} = {}) {
  const config = loadEsmsConfig(env);
  if (!config) return {}; // Keep P02's fail-closed PROVIDER_UNAVAILABLE default when disabled.
  const delivery = createSmsDelivery({ ...config, fetchImpl, clock, logger });
  return {
    contactDelivery: Object.freeze({
      send: (command) =>
        command?.channel === 'SMS' && command?.kind === 'OTP'
          ? delivery.send(command)
          : Promise.resolve(failureInvalidRequest())
    })
  };
}

function failureInvalidRequest() {
  return {
    status: 'FAILED',
    code: 'INVALID_REQUEST',
    retryable: false,
    uncertain: false,
    attempts: 0
  };
}
