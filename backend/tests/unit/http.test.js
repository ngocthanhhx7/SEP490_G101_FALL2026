import { describe, expect, jest, test } from '@jest/globals';
import { Router } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { requireSession, requireRoles } from '../../src/middlewares/session.js';
import { validateCommand } from '../../src/validators/command.validator.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { createPorts } from '../../src/config/ports.js';

function fixture({ max = 100, connection, portOverrides } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test', RATE_LIMIT_MAX: String(max) });
  const logger = jest.fn();
  const app = createApp({ config, connection: connection ?? { readyState: 0 }, lifecycle: { draining: false }, logger, portOverrides,
    moduleFactories: [({ ports }) => {
      const router = Router();
      router.get('/error', async () => { throw new Error('Synthetic secret and stack must never appear'); });
      router.get('/stream-error', (_req, res) => { res.write('partial'); throw new Error('Synthetic stream secret'); });
      router.get('/admin', requireSession(ports.session), requireRoles('ADMIN'), (_req, res) => res.json({ allowed: true }));
      router.get('/staff', requireSession(ports.session), requireRoles('STAFF'), (_req, res) => res.sendStatus(204));
      router.get('/customer', requireSession(ports.session), requireRoles('CUSTOMER'), (_req, res) => res.sendStatus(204));
      router.post('/command', validateCommand(body => body?.name === 'synthetic'), (_req, res) => res.sendStatus(204));
      return { name: 'test-only', mount: '/api/v1/testing', router };
    }]
  });
  return { app, logger };
}

describe('HTTP foundation (controlled DB/session doubles, not provider integration)', () => {
  test('health does not report ready when database is absent', async () => {
    const { app } = fixture();
    const health = await request(app).get('/health').expect(200);
    expect(health.body.data.status).toBe('alive');
    expect(health.headers['x-powered-by']).toBeUndefined();
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    await request(app).get('/ready').expect(503);
  });
  test('readiness checks actual ping rather than trusting connection flag', async () => {
    const connection = { readyState: 1, db: { admin: () => ({ command: async () => { throw new Error('unreachable'); } }) } };
    await request(fixture({ connection }).app).get('/ready').expect(503);
  });
  test('errors expose request ID and generic envelope but no secret/stack', async () => {
    const { app, logger } = fixture();
    const res = await request(app).get('/api/v1/testing/error').set('X-Request-ID', 'untrusted header text').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.meta.correlationId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/Synthetic secret|stack/);
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/Synthetic secret|stack/);
  });
  test('valid correlation UUID can be reused, unknown route uses same envelope', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const res = await request(fixture().app).get('/api/v1/nonexistent').set('X-Request-ID', id).expect(404);
    expect(res.body.meta.correlationId).toBe(id);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
  test('errors after headers abort without forwarding secret stacks to the Express default handler', async () => {
    const { app, logger } = fixture();
    await expect(request(app).get('/api/v1/testing/stream-error')).rejects.toThrow();
    expect(JSON.stringify(logger.mock.calls)).toContain('STREAM_ERROR');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('Synthetic stream secret');
  });
  test('malformed and excessive bodies are safely rejected', async () => {
    const { app } = fixture();
    await request(app).post('/api/v1/testing/command').set('Content-Type', 'application/json').send('{bad').expect(400);
    await request(app).post('/api/v1/testing/command').send({ name: 'x'.repeat(70000) }).expect(413);
    await request(app).post('/api/v1/testing/command').send({ name: 'wrong' }).expect(422);
    await request(app).post('/api/v1/testing/command').send({ name: 'synthetic' }).expect(204);
  });
  test('rate limits work without spoofable role headers or default session', async () => {
    const { app } = fixture({ max: 2 });
    await request(app).get('/api/v1/testing/admin').set('X-Role', 'ADMIN').expect(401);
    await request(app).get('/api/v1/testing/admin').expect(401);
    const res = await request(app).get('/api/v1/testing/admin').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await request(app).get('/health').expect(200);
  });
  test.each([
    [{ state: 'ACTIVE', roles: ['STAFF'], expiresAt: Date.now() + 60000 }, 403],
    [{ state: 'ACTIVE', roles: ['ADMIN'], expiresAt: 1 }, 401],
    [{ state: 'LOCKED', roles: ['ADMIN'], expiresAt: Date.now() + 60000 }, 401],
    [{ state: 'ACTIVE', roles: ['ADMIN'], expiresAt: Date.now() + 60000, synthetic: true }, 401],
    [{ state: 'ACTIVE', roles: ['ADMIN'], expiresAt: Date.now() + 60000 }, 200]
  ])('session/role port enforces expiry, status and synthetic denial', async (session, status) => {
    await request(fixture({ portOverrides: { session: { authenticate: async () => session } } }).app).get('/api/v1/testing/admin').expect(status);
  });
  test('unconfigured providers fail explicitly; no payment or delivery fake success', () => {
    const ports = createPorts();
    expect(() => ports.paymentGateway.createIntent()).toThrow('Provider is not configured');
    expect(() => ports.contactDelivery.send()).toThrow('Provider is not configured');
    expect(() => createPorts({ unknown: {} })).toThrow('Unknown provider port');
  });
  test('Admin inherits Staff actions, not Customer identity/actions', async () => {
    const app = fixture({ portOverrides: { session: { authenticate: async () => ({ state: 'ACTIVE', roles: ['ADMIN'], expiresAt: Date.now() + 60000 }) } } }).app;
    await request(app).get('/api/v1/testing/staff').expect(204);
    await request(app).get('/api/v1/testing/customer').expect(403);
  });
  test('module plan fails before mounting any partial registry', () => {
    const app = { use: jest.fn() }, router = Router();
    expect(() => registerModules(app, [{ name: 'one', mount: '/api/v1/one', router }, { name: 'one', mount: '/api/v1/two', router }])).toThrow();
    expect(app.use).not.toHaveBeenCalled();
  });
  test('fail-closed optional runtime modules do not abort application boot', () => {
    const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test' });
    expect(() => createApp({ config, connection: { readyState: 0 }, lifecycle: { draining: false },
      moduleFactories: [() => null, () => undefined] })).not.toThrow();
  });
});
