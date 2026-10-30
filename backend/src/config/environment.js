import { loadEsmsConfig } from './esms.js';
import { loadSmtpConfig } from './smtp.js';
import { isMailbox } from '../utils/mailbox.js';
import { loadR2Config, loadApplicantDocumentConfig } from './r2.js';
import { parseRoutingBounds } from '../validators/routing.validator.js';

export class ConfigurationError extends Error {
  constructor(fields) {
    super(`Invalid configuration fields: ${[...new Set(fields)].join(', ')}`);
    this.name = 'ConfigurationError';
    this.fields = [...new Set(fields)];
  }
}

export function loadConfig(env = process.env) {
  const invalid = [];
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv))
    invalid.push('NODE_ENV');
  function integer(key, fallback, min, max) {
    const raw = env[key] ?? String(fallback);
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max)
      invalid.push(key);
    return n;
  }
  const mongoUri = env.MONGO_URI;
  if (
    typeof mongoUri !== 'string' ||
    !/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(mongoUri)
  )
    invalid.push('MONGO_URI');
  const database = env.MONGO_DB;
  if (
    !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(database ?? '') ||
    ['admin', 'local', 'config'].includes(database?.toLowerCase())
  )
    invalid.push('MONGO_DB');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host))
    invalid.push('HOST');
  const seedValue = env.ALLOW_DEV_ADMIN_SEED ?? 'false';
  if (!['true', 'false'].includes(seedValue))
    invalid.push('ALLOW_DEV_ADMIN_SEED');
  if (nodeEnv === 'production' && seedValue === 'true')
    invalid.push('ALLOW_DEV_ADMIN_SEED');

  const authEnabledValue = env.AUTH_ENABLED ?? 'false';
  if (!['true', 'false'].includes(authEnabledValue))
    invalid.push('AUTH_ENABLED');
  const authEnabled = authEnabledValue === 'true';
  const contactInbox = env.CONTACT_INBOX_EMAIL || null;
  if (contactInbox && !isMailbox(contactInbox))
    invalid.push('CONTACT_INBOX_EMAIL');
  const authSecrets = {
    otpSecret: env.OTP_HMAC_SECRET,
    tokenSecret: env.SESSION_TOKEN_SECRET,
    csrfSecret: env.SESSION_CSRF_SECRET,
    contactLookupSecret: env.CONTACT_LOOKUP_SECRET,
    contactEncryptionKey: env.CONTACT_ENCRYPTION_KEY
  };
  if (authEnabled) {
    for (const [name, value] of Object.entries(authSecrets)) {
      const bytes =
        typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0;
      const valid =
        name === 'contactEncryptionKey' ? bytes === 32 : bytes >= 32;
      if (!valid) {
        const fields = {
          otpSecret: 'OTP_HMAC_SECRET',
          tokenSecret: 'SESSION_TOKEN_SECRET',
          csrfSecret: 'SESSION_CSRF_SECRET',
          contactLookupSecret: 'CONTACT_LOOKUP_SECRET',
          contactEncryptionKey: 'CONTACT_ENCRYPTION_KEY'
        };
        invalid.push(fields[name]);
      }
    }
  }

  for (const loadProviderConfig of [loadSmtpConfig, loadEsmsConfig, loadR2Config, loadApplicantDocumentConfig]) {
    try {
      loadProviderConfig(env);
    } catch (error) {
      if (Array.isArray(error?.details?.fields))
        invalid.push(...error.details.fields);
      else throw error;
    }
  }

  const aiEnabled = env.AI_ENABLED ?? 'false';
  if (!['true', 'false'].includes(aiEnabled)) invalid.push('AI_ENABLED');
  if (aiEnabled === 'true' && !authEnabled) invalid.push('AUTH_ENABLED');
  const routingUrl = env.AI_ROUTING_URL || null;
  if (routingUrl) {
    try {
      const url = new URL(routingUrl);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname))
        )
      )
        invalid.push('AI_ROUTING_URL');
    } catch {
      invalid.push('AI_ROUTING_URL');
    }
  }
  let routingBounds = null;
  try { routingBounds = parseRoutingBounds(env.AI_ROUTING_BOUNDS); }
  catch { invalid.push('AI_ROUTING_BOUNDS'); }
  const result = {
    ai: Object.freeze({ enabled: aiEnabled === 'true', routingUrl, routingBounds }),
    nodeEnv,
    host,
    mongoUri,
    database,
    contactInbox,
    allowDevAdminSeed: seedValue === 'true',
    auth: Object.freeze(
      authEnabled ? { enabled: true, ...authSecrets } : { enabled: false }
    ),
    secureCookies: nodeEnv === 'production',
    port: integer('PORT', 3000, 0, 65535),
    connectTimeoutMs: integer('MONGO_CONNECT_TIMEOUT_MS', 5000, 100, 30000),
    readinessTimeoutMs: integer('READINESS_TIMEOUT_MS', 1000, 100, 5000),
    shutdownTimeoutMs: integer('SHUTDOWN_TIMEOUT_MS', 10000, 100, 30000),
    rateLimitWindowMs: integer('RATE_LIMIT_WINDOW_MS', 60000, 1000, 3600000),
    rateLimitMax: integer('RATE_LIMIT_MAX', 100, 1, 10000),
    trustProxyHops: integer('TRUST_PROXY_HOPS', 0, 0, 1)
  };
  if (nodeEnv !== 'test' && result.port === 0) invalid.push('PORT');
  if (invalid.length) throw new ConfigurationError(invalid);
  return Object.freeze(result);
}
