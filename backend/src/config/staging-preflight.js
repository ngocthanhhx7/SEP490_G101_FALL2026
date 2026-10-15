import { ConfigurationError, loadConfig } from './environment.js';
import mongoose from 'mongoose';

// Offline policy checks only. This function never connects to a database/provider.
export function validateStagingEnvironment(env) {
  const config = loadConfig(env);
  const fields = [];
  if (config.nodeEnv !== 'production') fields.push('NODE_ENV');
  // A same-machine reverse proxy uses IPv4 loopback; managed hosts may require
  // a wildcard bind. This offline gate cannot verify the surrounding firewall.
  if (!['127.0.0.1', '0.0.0.0'].includes(config.host)) fields.push('HOST');
  if (!config.database.endsWith('_staging')) fields.push('MONGO_DB');
  if (env.ALLOW_DEV_ADMIN_SEED !== 'false') fields.push('ALLOW_DEV_ADMIN_SEED');
  if (!config.auth.enabled) fields.push('AUTH_ENABLED');
  // Registration and login currently support email only; SMS can serve contact
  // changes but cannot make an interactive staging environment usable.
  if (env.EMAIL_ENABLED !== 'true') fields.push('EMAIL_ENABLED');
  if (env.SMS_ENABLED === 'true' && env.ESMS_SANDBOX !== 'false') fields.push('ESMS_SANDBOX');

  const secretFields = ['OTP_HMAC_SECRET', 'SESSION_TOKEN_SECRET', 'SESSION_CSRF_SECRET',
    'CONTACT_LOOKUP_SECRET', 'CONTACT_ENCRYPTION_KEY'];
  const values = secretFields.map(field => env[field]);
  for (let index = 0; index < values.length; index += 1) {
    if (values.some((value, other) => other !== index && value === values[index])) {
      fields.push(secretFields[index]);
    }
  }

  // SRV defaults to TLS. Standard URIs must explicitly opt in. Reject weakened
  // certificate validation, duplicate TLS options and placeholders in either form.
  try {
    // Mongo's parser supports multi-host replica-set URIs; WHATWG URL does not.
    // Constructing a client parses options only; connect() is never called.
    const options = new mongoose.mongo.MongoClient(config.mongoUri).options;
    const query = new URL(`https://configuration.invalid/?${config.mongoUri.split('?')[1] ?? ''}`);
    const entries = [...query.searchParams].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]);
    const tls = entries.filter(([key]) => key === 'tls' || key === 'ssl');
    const insecure = entries.some(([key, value]) =>
      ['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(key) && value !== 'false');
    if (tls.length > 1 || tls.some(([, value]) => value !== 'true') || insecure || options.tls !== true
      || /[<>]|%3c|%3e|example\.invalid/i.test(config.mongoUri)) fields.push('MONGO_URI');
  } catch { fields.push('MONGO_URI'); }

  if (fields.length) throw new ConfigurationError(fields);
  return Object.freeze({ status: 'CONFIG_VALIDATED', scope: 'OFFLINE_ONLY',
    deploymentVerified: false });
}
