import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createVisitBoardRouter } from '../../src/routes/visit-board.routes.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';

const id = '507f1f77bcf86cd799439011';
const body = { expectedVersion: 1, message: 'Synthetic proposal', alternatives: [] };
function setup(role = 'STAFF') {
  const service = Object.fromEntries(['list', 'detail', 'proposeRemedy', 'respondRemedy', 'manualAssign']
    .map(method => [method, jest.fn(async () => ({ id, state: 'PENDING_CUSTOMER_CONFIRMATION' }))]));
  const sessionPort = { authenticate: async () => role === null ? null : ({ userId: id, sessionId: 'session-1', state: 'ACTIVE',
    roles: [role], expiresAt: Date.now() + 60000 }), verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const app = express(); app.use(express.json({ limit: '16kb' }), requestId);
  app.use('/api/v1', createVisitBoardRouter({ service, sessionPort, allowedOrigins: ['https://pwc.example.invalid'] }));
  app.use(errorHandler(() => {}));
  return { app, service };
}
describe('P22 HTTP module (export only, unregistered in production)', () => {
  test.each([null, 'CUSTOMER', 'PET_SITTER'])('role %s denied operational endpoint', async role => {
    const { app, service } = setup(role);
    const result = await request(app).get('/api/v1/staff/visit-board');
    expect(result.status).toBe(role === null ? 401 : 403);
    expect(service.list).not.toHaveBeenCalled();
  });
  test.each(['STAFF', 'ADMIN'])('%s receives P01 envelope', async role => {
    const { app, service } = setup(role);
    const result = await request(app).get('/api/v1/staff/visit-board?limit=20');
    expect(result.status).toBe(200); expect(result.body.meta.schemaVersion).toBe(1);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ roles: [role] }), query: { limit: '20' } }));
  });
  test.each([{}, { Origin: 'https://evil.example.invalid', 'X-CSRF-Token': 'synthetic-csrf' },
    { Origin: 'https://pwc.example.invalid', 'X-CSRF-Token': 'wrong' }])('write rejects missing/invalid CSRF %j', async headers => {
    const { app, service } = setup();
    const result = await request(app).post(`/api/v1/visits/${id}/remedies`).set(headers).send(body);
    expect(result.status).toBe(403); expect(service.proposeRemedy).not.toHaveBeenCalled();
  });
  test('scope/actor are server values; body cannot inject owner', async () => {
    const { app, service } = setup();
    const result = await request(app).post(`/api/v1/visits/${id}/remedies`).set('Origin', 'https://pwc.example.invalid')
      .set('X-CSRF-Token', 'synthetic-csrf').send({ ...body, customerId: 'other' });
    expect(result.status).toBe(422); expect(service.proposeRemedy).not.toHaveBeenCalled();
  });
  test('valid scoped Staff write forwards key, server actor and version', async () => {
    const { app, service } = setup();
    const result = await request(app).post(`/api/v1/visits/${id}/remedies`).set('Origin', 'https://pwc.example.invalid')
      .set('X-CSRF-Token', 'synthetic-csrf').set('Idempotency-Key', 'synthetic-operation-123').send(body);
    expect(result.status).toBe(201);
    expect(service.proposeRemedy).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: id }),
      visitId: id, expectedVersion: 1, idempotencyKey: 'synthetic-operation-123' }));
  });
  test('Customer can respond but Staff cannot respond as Customer', async () => {
    for (const role of ['CUSTOMER', 'STAFF']) {
      const { app, service } = setup(role);
      const result = await request(app).post(`/api/v1/visits/${id}/remedies/remedy-1/responses`)
        .set('Origin', 'https://pwc.example.invalid').set('X-CSRF-Token', 'synthetic-csrf')
        .send({ expectedVersion: 1, remedyVersion: 0, choice: 'DECLINE' });
      expect(result.status).toBe(role === 'CUSTOMER' ? 200 : 403);
      expect(service.respondRemedy.mock.calls).toHaveLength(role === 'CUSTOMER' ? 1 : 0);
    }
  });
  test('malformed canonical visit ID rejected before service read', async () => {
    const { app, service } = setup();
    expect((await request(app).get('/api/v1/visits/not-a-mongo-id/dispatch')).status).toBe(422);
    expect(service.detail).not.toHaveBeenCalled();
  });
  test('manual assignment rejects malformed canonical sitter ID', async () => {
    const { app, service } = setup();
    const result = await request(app).post(`/api/v1/visits/${id}/assignments`).set('Origin', 'https://pwc.example.invalid')
      .set('X-CSRF-Token', 'synthetic-csrf').send({ expectedVersion: 1, sitterId: 'bad-id', reason: 'Synthetic' });
    expect(result.status).toBe(422); expect(service.manualAssign).not.toHaveBeenCalled();
  });
});
