import { describe, expect, jest, test } from '@jest/globals';
import { Router } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { requireCsrf, requireSession, hasRole } from '../../src/middlewares/session.js';
import { createAuthorizationService, requireResourceAuthorization } from '../../src/services/authorization.service.js';

const RESOURCE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const allowedResource = { _id: RESOURCE_ID, ownerId: 'customer-1', state: 'ACTIVE' };
const actor = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: Date.now() + 60_000 });

describe('session role middleware', () => {
  test('Admin inherits Staff only and unsupported roles fail closed', () => {
    expect(hasRole(['ADMIN'], 'STAFF')).toBe(true);
    expect(hasRole(['ADMIN'], 'CUSTOMER')).toBe(false);
    expect(hasRole(['ROOT'], 'STAFF')).toBe(false);
  });

  test('session data is allowlisted and role claims are validated', async () => {
    const req = {};
    const next = jest.fn();
    const middleware = requireSession({ authenticate: async () => ({
      ...actor('customer-1', ['CUSTOMER']), expiresAt: 2_000_000, sessionId: 'session-1', synthetic: false,
      csrfSecret: 'do-not-copy', accessNotes: 'do-not-copy'
    }) }, { clock: () => 1_000_000 });
    await middleware(req, {}, next);
    expect(req.auth).toEqual({ userId: 'customer-1', sessionId: 'session-1', state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: 2_000_000 });
    expect(Object.isFrozen(req.auth)).toBe(true);
    expect(req.auth).not.toHaveProperty('csrfSecret');
    expect(req.auth).not.toHaveProperty('accessNotes');
    expect(next).toHaveBeenCalledWith();

    await expect(requireSession({ authenticate: async () => ({ ...actor('a', ['ROOT']) }) })({}, {}, jest.fn()))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('resource authorization', () => {
  test('checks actor, action, resource and ownership for a read', async () => {
    const audit = jest.fn();
    const policy = createAuthorizationService({
      loadResource: async query => query.resourceId === RESOURCE_ID ? allowedResource : null,
      policies: [{ resource: 'pet', action: 'READ', roles: ['CUSTOMER'],
        authorize: ({ actor: current, resource }) => current.userId === resource.ownerId ? true : { conceal: true } }],
      audit, clock: () => 0
    });
    await expect(policy.decide({ actor: actor('customer-1', ['CUSTOMER']), action: 'READ', resourceType: 'pet', resourceId: RESOURCE_ID }))
      .resolves.toMatchObject({ allowed: true, resource: allowedResource });
    await expect(policy.decide({ actor: actor('customer-2', ['CUSTOMER']), action: 'READ', resourceType: 'pet', resourceId: RESOURCE_ID }))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
    await expect(policy.decide({ actor: actor('customer-1', ['CUSTOMER']), action: 'DELETE', resourceType: 'pet', resourceId: RESOURCE_ID }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(policy.decide({ actor: actor('customer-1', ['CUSTOMER']), action: 'READ', resourceType: 'pet', resourceId: 'bad-id' }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(audit).toHaveBeenCalledTimes(4);
    expect(audit.mock.calls[1][0]).toMatchObject({ allowed: false, reason: 'RESOURCE_NOT_FOUND' });
  });

  test('conceals missing and cross-owner resources with one not-found result', async () => {
    const authorization = createAuthorizationService({
      loadResource: async ({ resourceId }) => resourceId === RESOURCE_ID ? allowedResource : null,
      audit: async () => {},
      policies: [{ resource: 'pet', action: 'READ', roles: ['CUSTOMER'], authorize: ({ actor: current, resource }) => current.userId === resource.ownerId ? true : { conceal: true } }]
    });
    await expect(authorization.decide({ actor: actor('other', ['CUSTOMER']), action: 'READ', resourceType: 'pet', resourceId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('fails closed when authorization audit is unavailable', async () => {
    const authorization = createAuthorizationService({
      loadResource: async () => allowedResource,
      policies: [{ resource: 'pet', action: 'READ', roles: ['ADMIN'], authorize: () => true }],
      audit: async () => { throw new Error('private audit backend detail'); }
    });
    await expect(authorization.decide({ actor: actor('admin', ['ADMIN']), action: 'READ', resourceType: 'pet', resourceId: RESOURCE_ID }))
      .rejects.toMatchObject({ status: 503, code: 'AUTHORIZATION_UNAVAILABLE' });
  });

  test('middleware denies unauthenticated access and passes the authorized resource', async () => {
    const authorization = createAuthorizationService({
      loadResource: async () => allowedResource,
      audit: async () => {},
      policies: [{ resource: 'pet', action: 'READ', roles: ['CUSTOMER'], authorize: ({ actor: current, resource }) => current.userId === resource.ownerId }]
    });
    const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test' });
    const app = createApp({ config, connection: { readyState: 0 }, lifecycle: { draining: false }, moduleFactories: [({ ports }) => {
      const router = Router();
      router.get('/:id', requireSession(ports.session), requireResourceAuthorization(authorization, { action: 'READ', resourceType: 'pet' }),
        (req, res) => res.json({ allowed: true, id: req.authorization.resource._id }));
      return { name: 'authorization-test', mount: '/api/v1/test-pets', router };
    }], portOverrides: { session: { authenticate: async () => actor('customer-1', ['CUSTOMER']) } } });
    await request(app).get(`/api/v1/test-pets/${RESOURCE_ID}`).expect(200, { allowed: true, id: RESOURCE_ID });
    const unauthenticated = createApp({ config, connection: { readyState: 0 }, lifecycle: { draining: false }, moduleFactories: [({ ports }) => {
      const router = Router();
      router.get('/:id', requireSession(ports.session), requireResourceAuthorization(authorization, { action: 'READ', resourceType: 'pet' }), (_req, res) => res.sendStatus(204));
      return { name: 'unauthenticated-test', mount: '/api/v1/unauthenticated-pets', router };
    }] });
    await request(unauthenticated).get(`/api/v1/unauthenticated-pets/${RESOURCE_ID}`).expect(401);
  });

  test('authorizes Staff and inherited Admin actions while denying Customer', async () => {
    const authorization = createAuthorizationService({
      loadResource: async () => ({ _id: RESOURCE_ID, state: 'ACTIVE' }),
      audit: async () => {},
      policies: [{ resource: 'account', action: 'READ', roles: ['STAFF'], authorize: () => true }]
    });
    await expect(authorization.decide({ actor: actor('staff', ['STAFF']), action: 'READ', resourceType: 'account', resourceId: RESOURCE_ID }))
      .resolves.toMatchObject({ allowed: true });
    await expect(authorization.decide({ actor: actor('admin', ['ADMIN']), action: 'READ', resourceType: 'account', resourceId: RESOURCE_ID }))
      .resolves.toMatchObject({ allowed: true });
    await expect(authorization.decide({ actor: actor('customer', ['CUSTOMER']), action: 'READ', resourceType: 'account', resourceId: RESOURCE_ID }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('CSRF protection', () => {
  test('requires authenticated session, same origin and a verified CSRF token', async () => {
    const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test' });
    const makeApp = ({ session, verifyCsrf = async (_auth, token) => token === 'valid-token' } = {}) => createApp({
      config, connection: { readyState: 0 }, lifecycle: { draining: false },
      portOverrides: { session: { authenticate: async () => session ?? null, verifyCsrf } },
      moduleFactories: [({ ports }) => {
        const router = Router();
        router.post('/', requireSession(ports.session), requireCsrf(ports.session), (_req, res) => res.sendStatus(204));
        return { name: 'csrf-test', mount: '/api/v1/csrf-test', router };
      }]
    });
    const authenticated = actor('customer-1', ['CUSTOMER']);
    const app = makeApp({ session: authenticated });
    await request(app).post('/api/v1/csrf-test').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', 'valid-token').expect(204);
    await request(app).post('/api/v1/csrf-test').set('Host', '127.0.0.1').set('Origin', 'https://evil.example').set('X-CSRF-Token', 'valid-token').expect(403);
    await request(app).post('/api/v1/csrf-test').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', 'wrong').expect(403);
    await request(makeApp()).post('/api/v1/csrf-test').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', 'valid-token').expect(401);
  });
});
