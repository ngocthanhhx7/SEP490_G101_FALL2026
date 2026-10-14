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
  if (!['development', 'test', 'production'].includes(nodeEnv)) invalid.push('NODE_ENV');
  function integer(key, fallback, min, max) {
    const raw = env[key] ?? String(fallback);
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) invalid.push(key);
    return n;
  }
  const mongoUri = env.MONGO_URI;
  if (typeof mongoUri !== 'string' || !/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(mongoUri)) invalid.push('MONGO_URI');
  const database = env.MONGO_DB;
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(database ?? '') || ['admin', 'local', 'config'].includes(database?.toLowerCase())) invalid.push('MONGO_DB');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) invalid.push('HOST');
  const seedValue = env.ALLOW_DEV_ADMIN_SEED ?? 'false';
  if (!['true', 'false'].includes(seedValue)) invalid.push('ALLOW_DEV_ADMIN_SEED');
  if (nodeEnv === 'production' && seedValue === 'true') invalid.push('ALLOW_DEV_ADMIN_SEED');
  const result = {
    nodeEnv, host, mongoUri, database, allowDevAdminSeed: seedValue === 'true',
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
