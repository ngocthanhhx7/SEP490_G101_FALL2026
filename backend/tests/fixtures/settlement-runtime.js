import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { userModel } from '../../src/models/user.model.js';
import { createSessionService } from '../../src/services/session.service.js';

export async function settlementRuntimeFixture(connection, uri, role) {
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: uri, MONGO_DB: 'settlement_runtime', AUTH_ENABLED: 'true',
    OTP_HMAC_SECRET: 'synthetic-otp-secret-with-at-least-32-bytes',
    SESSION_TOKEN_SECRET: 'synthetic-session-secret-with-at-least-32-bytes',
    SESSION_CSRF_SECRET: 'synthetic-csrf-secret-with-at-least-32-bytes',
    CONTACT_LOOKUP_SECRET: 'synthetic-lookup-secret-with-at-least-32-bytes',
    CONTACT_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef' });
  const app = createApp({ config, connection, lifecycle: { draining: false }, env: {} });
  const user = await userModel(connection).create({ displayName: 'Settlement test', roles: [role], state: 'ACTIVE' });
  const service = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const session = await connection.transaction(transaction => service.issueInTransaction(user, transaction));
  return { app, cookie: `pwc_session=${session.token}`, csrf: session.csrfToken };
}
