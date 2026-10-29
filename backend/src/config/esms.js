import { AppError } from '../utils/app-error.js';
import { DEFAULT_SMS_OTP_TEMPLATE, isSmsOtpTemplate } from '../validators/sms-template.validator.js';
function invalid(fields) {
  throw new AppError(
    503,
    'SMS_CONFIGURATION_INVALID',
    'SMS configuration is invalid',
    { fields }
  );
}

function safeCredential(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}

export function loadEsmsConfig(env = process.env) {
  if (env.SMS_ENABLED === undefined || env.SMS_ENABLED === 'false') return null;
  if (env.SMS_ENABLED !== 'true') invalid(['SMS_ENABLED']);

  const fields = [];
  if (!safeCredential(env.ESMS_API_KEY)) fields.push('ESMS_API_KEY');
  if (!safeCredential(env.ESMS_SECRET_KEY)) fields.push('ESMS_SECRET_KEY');
  if (
    typeof env.ESMS_BRANDNAME !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,10}$/.test(env.ESMS_BRANDNAME)
  )
    fields.push('ESMS_BRANDNAME');

  const timeoutMs = Number(env.SMS_TIMEOUT_MS ?? '10000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
    fields.push('SMS_TIMEOUT_MS');
  const sandboxValue = env.ESMS_SANDBOX ?? 'false';
  if (!['true', 'false'].includes(sandboxValue)) fields.push('ESMS_SANDBOX');
  const otpTemplate = env.ESMS_OTP_TEMPLATE ?? DEFAULT_SMS_OTP_TEMPLATE;
  if (!isSmsOtpTemplate(otpTemplate)) fields.push('ESMS_OTP_TEMPLATE');
  if (fields.length) invalid(fields);

  return {
    apiKey: env.ESMS_API_KEY,
    secretKey: env.ESMS_SECRET_KEY,
    brandname: env.ESMS_BRANDNAME,
    timeoutMs,
    sandbox: sandboxValue === 'true',
    otpTemplate
  };
}
