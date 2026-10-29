import { AppError } from '../utils/app-error.js';
import { isMailbox } from '../utils/mailbox.js';
function invalid(fields) {
  throw new AppError(
    503,
    'EMAIL_CONFIGURATION_INVALID',
    'Email configuration is invalid',
    { fields }
  );
}
export function loadSmtpConfig(env = process.env) {
  if (env.EMAIL_ENABLED === undefined || env.EMAIL_ENABLED === 'false')
    return null;
  if (env.EMAIL_ENABLED !== 'true') invalid(['EMAIL_ENABLED']);
  const fields = [];
  if (
    !/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(
      env.SMTP_HOST ?? ''
    )
  )
    fields.push('SMTP_HOST');
  if (!['465', '587'].includes(env.SMTP_PORT)) fields.push('SMTP_PORT');
  if (
    typeof env.SMTP_USER !== 'string' ||
    !env.SMTP_USER.trim() ||
    /[\r\n\x00]/.test(env.SMTP_USER)
  )
    fields.push('SMTP_USER');
  if (typeof env.SMTP_PASSWORD !== 'string' || !env.SMTP_PASSWORD.trim())
    fields.push('SMTP_PASSWORD');
  if (!isMailbox(env.EMAIL_FROM)) fields.push('EMAIL_FROM');
  const timeoutMs = Number(env.EMAIL_TIMEOUT_MS ?? '10000');
  const maxAttempts = Number(env.EMAIL_MAX_ATTEMPTS ?? '2');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
    fields.push('EMAIL_TIMEOUT_MS');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3)
    fields.push('EMAIL_MAX_ATTEMPTS');
  if (fields.length) invalid(fields);
  return {
    from: env.EMAIL_FROM,
    timeoutMs,
    maxAttempts,
    options: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: env.SMTP_PORT === '465',
      requireTLS: true,
      tls: { rejectUnauthorized: true, servername: env.SMTP_HOST },
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
      pool: false,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true
    }
  };
}
