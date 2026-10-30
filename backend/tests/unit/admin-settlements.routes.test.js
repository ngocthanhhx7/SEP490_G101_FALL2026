import { test, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { adminSettlementModule } from '../../src/routes/admin-settlements.routes.js';

function setup() {
  const service = { list: jest.fn(async () => ({ items: [], decisionIds: [] })),
    decide: jest.fn(async () => ({ status: 'APPROVED' })),
    recordTransfer: jest.fn(async () => ({ status: 'TRANSFER_PENDING' })) };
  const sessionService = { authenticate: async req => req.get('x-test-role') ? ({ userId: 'a',
    sessionId: 's', state: 'ACTIVE', roles: [req.get('x-test-role')], expiresAt: Date.now() + 60000 }) : null,
  verifyCsrf: async (_actor, token) => token === 'csrf-test' };
  const app = createApp({ config: { trustProxyHops: 0, rateLimitWindowMs: 60000,
    rateLimitMax: 100, auth: { enabled: false } }, connection: {}, lifecycle: {}, env: {},
  moduleFactories: [() => adminSettlementModule({ service, sessionService })] });
  const csrf = req => req.set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1')
    .set('X-CSRF-Token', 'csrf-test').set('Idempotency-Key', 'route-key-1');
  return { app, service, csrf };
}

test('anonymous, customer, sitter and staff cannot read payroll', async () => {
  const f = setup();
  expect((await request(f.app).get('/api/v1/admin/settlements')).status).toBe(401);
  for (const role of ['CUSTOMER', 'PET_SITTER', 'STAFF']) {
    expect((await request(f.app).get('/api/v1/admin/settlements').set('x-test-role', role)).status).toBe(403);
  }
  expect(f.service.list).not.toHaveBeenCalled();
});

test('CSRF and extra fields block writes; unknown transfer returns 202', async () => {
  const f = setup();
  expect((await request(f.app).post('/api/v1/admin/settlements/r1/decisions')
    .set('x-test-role', 'ADMIN').send({ decision: 'APPROVE' })).status).toBe(403);
  expect((await f.csrf(request(f.app).post('/api/v1/admin/settlements/r1/decisions')
    .set('x-test-role', 'ADMIN')).send({ decision: 'APPROVE', sitterId: 'foreign' })).status).toBe(422);
  const result = await f.csrf(request(f.app).post('/api/v1/admin/settlements/r1/transfer-records')
    .set('x-test-role', 'ADMIN')).send({ outcome: 'UNKNOWN', expectedVersion: 1, reference: 'bank-1', evidenceReference: 'private-1' });
  expect(result.status).toBe(202);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(f.service.decide).not.toHaveBeenCalled();
});
