import { describe, expect, jest, test } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { requireSession } from '../../src/middlewares/session.js';
import { authModule } from '../../src/routes/auth.routes.js';
import { AppError } from '../../src/utils/app-error.js';

const auth = { userId: 'customer-1', sessionId: 'session-1', state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: Date.now() + 60000 };

function appFixture({ authenticated = false } = {}) {
  const otpService = {
    begin: jest.fn(async () => ({ status: 'PENDING', challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresInSeconds: 300, resendAfterSeconds: 60 })),
    verify: jest.fn(async body => body.purpose === 'LOGIN'
      ? { status: 'VERIFIED', authenticated: true, session: {
        token: 'opaque-session-secret-never-return-this', csrfToken: 'a'.repeat(43), expiresAt: Date.now() + 60000,
        user: { id: auth.userId, displayName: 'Synthetic Customer', roles: ['CUSTOMER'] }
      } }
      : { status: 'VERIFIED', authenticated: false })
  };
  const sessionService = {
    authenticate: async () => authenticated ? auth : null,
    verifyCsrf: async (_actor, token) => token === 'valid-csrf',
    setCookie: (res, issued, { secure }) => res.cookie('pwc_session', issued.token, { httpOnly: true, secure, sameSite: 'lax' }),
    clearCookie: (res, options) => res.clearCookie('pwc_session', options),
    revoke: jest.fn(async () => true)
  };
  const requireCsrf = async (req, _res, next) => {
    const origin = req.get('origin');
    const expectedOrigin = `${req.protocol}://${req.get('host')}`;
    if (!req.auth || origin !== expectedOrigin || !await sessionService.verifyCsrf(req.auth, req.get('x-csrf-token'))) {
      throw new AppError(403, 'CSRF_REJECTED', 'Request verification failed');
    }
    next();
  };
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test' });
  const server = createApp({ config, connection: { readyState: 0 }, lifecycle: { draining: false }, moduleFactories: [() => authModule({
    otpService, sessionService, requireAuthenticated: requireSession(sessionService), requireCsrf, secureCookies: false
  })] });
  return { server, otpService, sessionService };
}

describe('P06 auth route module (not registered by P34 runtime)', () => {
  test('returns generic OTP challenge metadata and rejects unknown fields', async () => {
    const { server, otpService } = appFixture();
    await request(server).post('/api/v1/otp-challenges').send({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', userId: 'forbidden' })
      .expect(422);
    const response = await request(server).post('/api/v1/otp-challenges')
      .send({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' }).expect(202);
    expect(response.body.data).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(JSON.stringify(response.body)).not.toContain('person@example.test');
    expect(otpService.begin).toHaveBeenCalledTimes(1);
  });

  test('creates an HttpOnly session cookie without returning the bearer secret', async () => {
    const { server } = appFixture();
    const response = await request(server).post('/api/v1/sessions').send({
      challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', channel: 'EMAIL',
      contact: 'person@example.test', purpose: 'LOGIN', code: '123456'
    }).expect(200);
    expect(response.headers['set-cookie'][0]).toMatch(/pwc_session=opaque-session-secret-never-return-this/);
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(response.body.data).toMatchObject({ authenticated: true, csrfToken: 'a'.repeat(43) });
    expect(JSON.stringify(response.body)).not.toContain('opaque-session-secret-never-return-this');
  });

  test('protects contact changes and logout with same-origin CSRF checks', async () => {
    const { server, otpService, sessionService } = appFixture({ authenticated: true });
    const cookie = 'pwc_session=opaque-session-cookie-value';
    const headers = { Host: '127.0.0.1', Origin: 'http://127.0.0.1', Cookie: cookie, 'X-CSRF-Token': 'valid-csrf' };
    await request(server).post('/api/v1/me/contact-changes').set(headers).send({ channel: 'PHONE', contact: '+84912345678' }).expect(202);
    expect(otpService.begin).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'CONTACT_CHANGE', actor: auth }));
    await request(server).delete('/api/v1/sessions/current').set({ ...headers, 'X-CSRF-Token': 'invalid' }).expect(403);
    await request(server).delete('/api/v1/sessions/current').set(headers).expect(204);
    expect(sessionService.revoke).toHaveBeenCalledTimes(1);
  });
});
