import { expect, jest, test } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { sitterOperationsModule } from '../../src/routes/sitter-operations.routes.js';

function setup() {
  const offerService = { list: jest.fn(async () => ({ items: [], nextCursor: null, limit: 20 })), detail: jest.fn(), assignments: jest.fn(async () => ({ items: [], nextCursor: null, limit: 20 })), accept: jest.fn(), decline: jest.fn() };
  const visitService = { detail: jest.fn(async (_actor, visitId) => ({ visitId, state: 'ASSIGNED', version: 1 })), accessNotes: jest.fn() };
  const reassignmentService = { reassign: jest.fn(async input => ({ visitId: input.visitId, state: 'ASSIGNED', sitterId: input.newSitterId, version: 2 })) };
  const withdrawalService = { withdraw: jest.fn(async input => ({ visitId: input.visitId, state: 'WITHDRAWN', version: input.expectedVersion + 1 })) };
  const sessionService = { authenticate: async req => ({ userId: 'actor-1', sessionId: 'session-1', state: 'ACTIVE', roles: [req.get('x-test-role') || 'PET_SITTER'], expiresAt: Date.now() + 60000 }), verifyCsrf: async (_actor, token) => token === 'csrf-test' };
  const app = createApp({ config: { trustProxyHops: 0, rateLimitWindowMs: 60000, rateLimitMax: 100, auth: { enabled: false } }, connection: {}, lifecycle: {}, env: {}, moduleFactories: [() => sitterOperationsModule({ offerService, visitService, reassignmentService, withdrawalService, sessionService })] });
  const csrf = req => req.set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', 'csrf-test').set('Idempotency-Key', 'route-key-0001');
  return { app, offerService, visitService, reassignmentService, withdrawalService, csrf };
}

test('sitter offer and visit reads are role scoped and use standard envelopes', async () => {
  const { app, offerService, visitService } = setup();
  const offers = await request(app).get('/api/v1/offers').set('x-test-role', 'PET_SITTER');
  expect(offers.status).toBe(200); expect(offers.body.meta.schemaVersion).toBe(1); expect(offerService.list).toHaveBeenCalled();
  const visit = await request(app).get('/api/v1/visits/visit-1').set('x-test-role', 'PET_SITTER');
  expect(visit.status).toBe(200); expect(visit.body.data.visitId).toBe('visit-1'); expect(visitService.detail).toHaveBeenCalled();
  const staff = await request(app).get('/api/v1/offers').set('x-test-role', 'STAFF');
  expect(staff.status).toBe(403);
});

test('acceptance and reassignment require CSRF, idempotency and bounded bodies', async () => {
  const { app, offerService, reassignmentService, csrf } = setup();
  const noCsrf = await request(app).post('/api/v1/offers/offer-1/acceptances').set('x-test-role', 'PET_SITTER').send({ expectedVersion: 1 });
  expect(noCsrf.status).toBe(403);
  offerService.accept.mockResolvedValue({ offerId: 'offer-1', visitId: 'visit-1', state: 'ASSIGNED' });
  const accepted = await csrf(request(app).post('/api/v1/offers/offer-1/acceptances').set('x-test-role', 'PET_SITTER')).send({ expectedVersion: 1 });
  expect(accepted.status).toBe(200); expect(offerService.accept).toHaveBeenCalledWith(expect.objectContaining({ userId: 'actor-1' }), 'offer-1', 1, 'route-key-0001');
  const extra = await csrf(request(app).post('/api/v1/visits/visit-1/reassignments').set('x-test-role', 'STAFF')).send({ newSitterId: 'sitter-2', expectedVersion: 1, reason: 'replace', privateNote: 'secret' });
  expect(extra.status).toBe(422); expect(reassignmentService.reassign).not.toHaveBeenCalled();
});

test('withdrawal is operational and forwards the exact version/key', async () => {
  const { app, withdrawalService, csrf } = setup();
  const response = await csrf(request(app).post('/api/v1/visits/visit-1/withdrawals').set('x-test-role', 'PET_SITTER')).send({ expectedVersion: 1, reason: 'Conflict' });
  expect(response.status).toBe(200); expect(response.body.data.state).toBe('WITHDRAWN');
  expect(withdrawalService.withdraw).toHaveBeenCalledWith(expect.objectContaining({ visitId: 'visit-1', expectedVersion: 1, idempotencyKey: 'route-key-0001' }));
});
