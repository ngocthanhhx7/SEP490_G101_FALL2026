import { ConfigurationError, loadConfig } from './environment.js';
import mongoose from 'mongoose';

const STAGING_TOPOLOGIES = new Set(['local-ec2', 'remote']);

function mongoUriParts(uri) {
  const scheme = uri.match(/^mongodb(?:\+srv)?:\/\//i)?.[0];
  if (!scheme) throw new Error('Invalid Mongo URI');
  const rest = uri.slice(scheme.length);
  const end = rest.search(/[/?]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  const at = authority.lastIndexOf('@');
  const credentials = at < 0 ? '' : authority.slice(0, at);
  const hostPart = at < 0 ? authority : authority.slice(at + 1);
  const hosts = hostPart.split(',').map(token => {
    const value = token.trim();
    if (!value) throw new Error('Invalid Mongo host');
    if (value.startsWith('[')) {
      const close = value.indexOf(']');
      if (close < 0) throw new Error('Invalid Mongo host');
      return value.slice(1, close).toLowerCase();
    }
    return value.replace(/:\d+$/, '').toLowerCase();
  });
  return { scheme: scheme.toLowerCase(), credentials, hosts };
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1';
}

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
  const topology = env.STAGING_MONGO_TOPOLOGY;
  if (!STAGING_TOPOLOGIES.has(topology)) fields.push('STAGING_MONGO_TOPOLOGY');
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
    const uriParts = mongoUriParts(config.mongoUri);
    const query = new URL(`https://configuration.invalid/?${config.mongoUri.split('?')[1] ?? ''}`);
    const entries = [...query.searchParams].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]);
    const tls = entries.filter(([key]) => key === 'tls' || key === 'ssl');
    const insecure = entries.some(([key, value]) =>
      ['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(key) && value !== 'false');
    const hasCredentials = uriParts.credentials.includes(':')
      && uriParts.credentials.split(':').every(value => value.length > 0);
    const hasReplicaSet = typeof options.replicaSet === 'string' && options.replicaSet.length > 0;
    const hasLoopback = uriParts.hosts.some(host => isLoopbackHost(host) || host === 'localhost');
    const allLoopback = uriParts.hosts.every(isLoopbackHost);
    const topologyInvalid = topology === 'local-ec2'
      ? uriParts.scheme !== 'mongodb://' || !allLoopback || !hasCredentials || !hasReplicaSet
      : !hasCredentials || (!hasReplicaSet && uriParts.scheme !== 'mongodb+srv://');
    const tlsInvalid = tls.length > 1 || tls.some(([, value]) => value !== 'true') || insecure;
    if (tlsInvalid || /[<>]|%3c|%3e|example\.invalid/i.test(config.mongoUri)
      || (topology === 'remote' && (options.tls !== true || hasLoopback))
      || topologyInvalid) fields.push('MONGO_URI');
  } catch { fields.push('MONGO_URI'); }

  if (fields.length) throw new ConfigurationError(fields);
  return Object.freeze({ status: 'CONFIG_VALIDATED', scope: 'OFFLINE_ONLY',
    deploymentVerified: false });
}
