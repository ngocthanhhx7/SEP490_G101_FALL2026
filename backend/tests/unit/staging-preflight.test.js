import { describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateStagingEnvironment } from '../../src/config/staging-preflight.js';

function environment(overrides = {}) {
  return {
    NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '10000',
    MONGO_URI: 'mongodb+srv://synthetic:synthetic@cluster.test/?retryWrites=true&w=majority',
    MONGO_DB: 'paw_world_care_staging', ALLOW_DEV_ADMIN_SEED: 'false', AUTH_ENABLED: 'true',
    STAGING_MONGO_TOPOLOGY: 'remote',
    OTP_HMAC_SECRET: 'a'.repeat(32), SESSION_TOKEN_SECRET: 'b'.repeat(32),
    SESSION_CSRF_SECRET: 'c'.repeat(32), CONTACT_LOOKUP_SECRET: 'd'.repeat(32),
    CONTACT_ENCRYPTION_KEY: 'e'.repeat(32),
    EMAIL_ENABLED: 'true', SMTP_HOST: 'smtp.test', SMTP_PORT: '587',
    SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic', EMAIL_FROM: 'synthetic@example.test',
    SMS_ENABLED: 'false', ...overrides
  };
}

describe('offline staging environment gate', () => {
  test('valid configuration returns only an offline status, never secrets', () => {
    expect(validateStagingEnvironment(environment())).toEqual({ status: 'CONFIG_VALIDATED',
      scope: 'OFFLINE_ONLY', deploymentVerified: false });
  });

  test.each([
    [{ NODE_ENV: 'development' }, 'NODE_ENV'],
    [{ HOST: '::' }, 'HOST'],
    [{ MONGO_DB: 'paw_world_care_prod' }, 'MONGO_DB'],
    [{ ALLOW_DEV_ADMIN_SEED: 'true' }, 'ALLOW_DEV_ADMIN_SEED'],
    [{ ALLOW_DEV_ADMIN_SEED: undefined }, 'ALLOW_DEV_ADMIN_SEED'],
    [{ AUTH_ENABLED: 'false' }, 'AUTH_ENABLED'],
    [{ EMAIL_ENABLED: 'false' }, 'EMAIL_ENABLED'],
    [{ OTP_HMAC_SECRET: 'short' }, 'OTP_HMAC_SECRET'],
    [{ CONTACT_ENCRYPTION_KEY: 'é'.repeat(32) }, 'CONTACT_ENCRYPTION_KEY'],
    [{ SESSION_CSRF_SECRET: 'b'.repeat(32) }, 'SESSION_CSRF_SECRET'],
    [{ TRUST_PROXY_HOPS: '2' }, 'TRUST_PROXY_HOPS'],
    [{ SMTP_PASSWORD: '' }, 'SMTP_PASSWORD'],
    [{ MONGO_URI: 'mongodb://localhost:27017/' }, 'MONGO_URI'],
    [{ STAGING_MONGO_TOPOLOGY: undefined }, 'STAGING_MONGO_TOPOLOGY'],
    [{ MONGO_URI: 'mongodb+srv://cluster.test/?tls=false' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb+srv://cluster.test/?SSL=false' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb+srv://cluster.test/?tls=true&tls=false' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb+srv://cluster.test/?tlsAllowInvalidCertificates=true' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb+srv://cluster.test/?tlsAllowInvalidHostnames=true' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb+srv://cluster.test/?tlsInsecure=true' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb://synthetic:synthetic@db.test:27017/?tls=true' }, 'MONGO_URI'],
    [{ MONGO_URI: 'mongodb+srv://<user>:<password>@cluster.test/' }, 'MONGO_URI']
  ])('rejects unsafe configuration without disclosing its values (%j)', (overrides, field) => {
    try {
      validateStagingEnvironment(environment(overrides));
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error.name).toBe('ConfigurationError');
      expect(error.fields).toContain(field);
      expect(error.message).toBe(`Invalid configuration fields: ${error.fields.join(', ')}`);
    }
  });

  test('allows explicit TLS on standard Mongo replica-set URI', () => {
    expect(validateStagingEnvironment(environment({
      MONGO_URI: 'mongodb://synthetic:synthetic@db1.test:27017,db2.test:27017/?replicaSet=rs0&tls=true'
    })).status).toBe('CONFIG_VALIDATED');
  });

  test('allows authenticated local EC2 replica-set Mongo without TLS', () => {
    expect(validateStagingEnvironment(environment({
      STAGING_MONGO_TOPOLOGY: 'local-ec2',
      MONGO_URI: 'mongodb://synthetic:synthetic@127.0.0.1:27017/?replicaSet=rs0&authSource=admin'
    })).status).toBe('CONFIG_VALIDATED');
  });

  test.each([
    ['missing authentication', 'mongodb://127.0.0.1:27017/?replicaSet=rs0'],
    ['missing replica set', 'mongodb://synthetic:synthetic@127.0.0.1:27017/'],
    ['network host', 'mongodb://synthetic:synthetic@10.0.0.4:27017/?replicaSet=rs0'],
    ['mixed loopback and remote hosts', 'mongodb://synthetic:synthetic@127.0.0.1:27017,db.test:27017/?replicaSet=rs0'],
    ['SRV URI', 'mongodb+srv://synthetic:synthetic@cluster.test/?retryWrites=true']
  ])('rejects unsafe local EC2 topology (%s)', (_name, uri) => {
    expect(() => validateStagingEnvironment(environment({
      STAGING_MONGO_TOPOLOGY: 'local-ec2', MONGO_URI: uri
    }))).toThrow('MONGO_URI');
  });

  test('accepts loopback behind the EC2 local proxy without claiming deployment', () => {
    expect(validateStagingEnvironment(environment({ HOST: '127.0.0.1',
      PORT: '3000', TRUST_PROXY_HOPS: '1' }))).toEqual({ status: 'CONFIG_VALIDATED',
      scope: 'OFFLINE_ONLY', deploymentVerified: false });
  });

  test('SMS sandbox cannot stand in for staging delivery', () => {
    expect(() => validateStagingEnvironment(environment({
      SMS_ENABLED: 'true', ESMS_API_KEY: 'synthetic', ESMS_SECRET_KEY: 'synthetic',
      ESMS_BRANDNAME: 'Synthetic', ESMS_SANDBOX: 'true'
    }))).toThrow('ESMS_SANDBOX');
  });

  test('SMS-only configuration cannot satisfy email-only authentication', () => {
    expect(() => validateStagingEnvironment(environment({
      EMAIL_ENABLED: 'false', SMS_ENABLED: 'true', ESMS_API_KEY: 'synthetic',
      ESMS_SECRET_KEY: 'synthetic', ESMS_BRANDNAME: 'Synthetic', ESMS_SANDBOX: 'false'
    }))).toThrow('EMAIL_ENABLED');
  });

  test('CLI reports offline success and fails with safe fields on unsafe input', () => {
    const path = fileURLToPath(new URL('../../scripts/deployment/staging-preflight.js', import.meta.url));
    const valid = spawnSync(process.execPath, [path], { env: environment(), encoding: 'utf8' });
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toEqual({ status: 'CONFIG_VALIDATED',
      scope: 'OFFLINE_ONLY', deploymentVerified: false });
    const invalid = spawnSync(process.execPath, [path], {
      env: environment({ MONGO_URI: 'mongodb+srv://synthetic:synthetic@cluster.test/?tls=false' }),
      encoding: 'utf8'
    });
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout)).toEqual({ status: 'INVALID_CONFIGURATION',
      fields: ['MONGO_URI'], deploymentVerified: false });
    expect(invalid.stderr).toBe('');
    expect(invalid.stdout).not.toContain('synthetic');
  });
});
