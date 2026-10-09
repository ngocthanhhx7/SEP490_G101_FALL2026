import 'dotenv/config';
import { z } from 'zod';

const durationPattern = /^\d+(ms|s|m|h|d)$/i;

function durationToMs(value) {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(value);
  if (!match) return Number.NaN;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return amount * multiplier;
}

const duration = z.string()
  .regex(durationPattern)
  .transform(durationToMs)
  .refine((value) => value > 0, 'Duration must be greater than zero');

const quota = z.string().transform((value, ctx) => {
  const match = /^(\d+)\/(\d+(?:ms|s|m|h|d))$/i.exec(value);
  if (!match) {
    ctx.addIssue({ code: 'custom', message: 'Expected quota in <count>/<duration> format, e.g. 5/60m' });
    return z.NEVER;
  }

  const count = Number(match[1]);
  const windowMs = durationToMs(match[2]);
  if (count < 1 || windowMs < 1) {
    ctx.addIssue({ code: 'custom', message: 'Quota count and duration must be greater than zero' });
    return z.NEVER;
  }

  return { count, windowMs };
});

const trustProxy = z.string().default('loopback').transform((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
});

const sandboxMode = z.enum(['0', '1']).default('0').transform((value) => value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//, 'Must be a MongoDB connection string'),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  TRUST_PROXY: trustProxy,
  OTP_TTL: duration,
  PENDING_TTL: duration,
  MAX_WRONG_OTP: z.coerce.number().int().positive(),
  MAX_RESEND: z.coerce.number().int().nonnegative(),
  CONTACT_QUOTA: quota,
  RESEND_COOLDOWN: duration,
  REGISTER_IP_LIMIT: z.coerce.number().int().positive(),
  RESEND_IP_LIMIT: z.coerce.number().int().positive(),
  VERIFY_IP_LIMIT: z.coerce.number().int().positive(),
  LOGIN_REQUEST_IP_LIMIT: z.coerce.number().int().positive().default(20),
  LOGIN_VERIFY_IP_LIMIT: z.coerce.number().int().positive().default(60),
  SITTER_APPLICATION_IP_LIMIT: z.coerce.number().int().positive().default(10),
  SITTER_RESEND_IP_LIMIT: z.coerce.number().int().positive().default(10),
  SITTER_VERIFY_IP_LIMIT: z.coerce.number().int().positive().default(30),
  IP_RATE_WINDOW: duration,
  LOGIN_SESSION_TTL: z.string().default('30d').pipe(duration),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive(),
  RESERVATION_TTL: duration,
  OTP_HMAC_SECRET: z.string().min(32, 'Must contain at least 32 characters'),
  PET_SITTER_PII_ENCRYPTION_KEY: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^[a-fA-F0-9]{64}$/, 'Must be a 32-byte hex key').optional(),
  ),
  OTP_EMAIL_PROVIDER: z.enum(['mock', 'gmail']).default('mock'),
  OTP_SMS_PROVIDER: z.enum(['mock', 'esms']).default('mock'),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ESMS_API_KEY: z.string().optional(),
  ESMS_SECRET_KEY: z.string().optional(),
  ESMS_BRANDNAME: z.string().optional(),
  ESMS_CONTENT_TEMPLATE: z.string().optional(),
  ESMS_SANDBOX: sandboxMode,
  ESMS_IS_UNICODE: z.enum(['0', '1']).default('0'),
}).superRefine((values, ctx) => {
  if (values.RESERVATION_TTL <= values.PROVIDER_TIMEOUT_MS) {
    ctx.addIssue({
      code: 'custom',
      path: ['RESERVATION_TTL'],
      message: 'Must exceed PROVIDER_TIMEOUT_MS so a send reservation cannot expire during provider delivery',
    });
  }

  if (values.OTP_EMAIL_PROVIDER === 'gmail') {
    for (const key of ['GMAIL_USER', 'GMAIL_APP_PASSWORD']) {
      if (!values[key]?.trim()) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Required when OTP_EMAIL_PROVIDER=gmail` });
      }
    }
  }

  if (values.OTP_SMS_PROVIDER === 'esms') {
    for (const key of ['ESMS_API_KEY', 'ESMS_SECRET_KEY', 'ESMS_BRANDNAME', 'ESMS_CONTENT_TEMPLATE']) {
      if (!values[key]?.trim()) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Required when OTP_SMS_PROVIDER=esms` });
      }
    }
    if (values.ESMS_CONTENT_TEMPLATE && !values.ESMS_CONTENT_TEMPLATE.includes('{OTP}')) {
      ctx.addIssue({
        code: 'custom',
        path: ['ESMS_CONTENT_TEMPLATE'],
        message: 'Must include the {OTP} placeholder',
      });
    }
  }

  if (values.NODE_ENV === 'production' && !values.PET_SITTER_PII_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['PET_SITTER_PII_ENCRYPTION_KEY'],
      message: 'Required in production to encrypt Pet Sitter identity documents',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map(({ path, message }) => `- ${path.join('.')}: ${message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const config = Object.freeze({
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGODB_URI,
  mongoServerSelectionTimeoutMs: parsed.data.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  trustProxy: parsed.data.TRUST_PROXY,
  otpTtlMs: parsed.data.OTP_TTL,
  pendingTtlMs: parsed.data.PENDING_TTL,
  maxWrongOtp: parsed.data.MAX_WRONG_OTP,
  maxResend: parsed.data.MAX_RESEND,
  contactQuota: parsed.data.CONTACT_QUOTA,
  resendCooldownMs: parsed.data.RESEND_COOLDOWN,
  ipRateLimits: Object.freeze({
    register: parsed.data.REGISTER_IP_LIMIT,
    resend: parsed.data.RESEND_IP_LIMIT,
    verify: parsed.data.VERIFY_IP_LIMIT,
    loginRequest: parsed.data.LOGIN_REQUEST_IP_LIMIT,
    loginVerify: parsed.data.LOGIN_VERIFY_IP_LIMIT,
    sitterApplication: parsed.data.SITTER_APPLICATION_IP_LIMIT,
    sitterResend: parsed.data.SITTER_RESEND_IP_LIMIT,
    sitterVerify: parsed.data.SITTER_VERIFY_IP_LIMIT,
    windowMs: parsed.data.IP_RATE_WINDOW,
  }),
  loginSessionTtlMs: parsed.data.LOGIN_SESSION_TTL,
  providerTimeoutMs: parsed.data.PROVIDER_TIMEOUT_MS,
  reservationTtlMs: parsed.data.RESERVATION_TTL,
  otpHmacSecret: parsed.data.OTP_HMAC_SECRET,
  petSitterPiiEncryptionKey: parsed.data.PET_SITTER_PII_ENCRYPTION_KEY,
  otpEmailProvider: parsed.data.OTP_EMAIL_PROVIDER,
  otpSmsProvider: parsed.data.OTP_SMS_PROVIDER,
  gmailUser: parsed.data.GMAIL_USER,
  gmailAppPassword: parsed.data.GMAIL_APP_PASSWORD,
  emailFrom: parsed.data.EMAIL_FROM || parsed.data.GMAIL_USER,
  esmsApiKey: parsed.data.ESMS_API_KEY,
  esmsSecretKey: parsed.data.ESMS_SECRET_KEY,
  esmsBrandname: parsed.data.ESMS_BRANDNAME,
  esmsContentTemplate: parsed.data.ESMS_CONTENT_TEMPLATE,
  esmsSandbox: parsed.data.ESMS_SANDBOX,
  esmsIsUnicode: parsed.data.ESMS_IS_UNICODE,
});
