import request from 'supertest';
import { createApp } from '../../src/app.js';
import { refundLifecycleModule, refundProposalModule } from '../../src/routes/refunds.routes.js';
import { describe, expect, jest, test } from '@jest/globals';

function setup() {
  const refundService = {
    propose: jest.fn(async command => ({ id: '0123456789abcdef01234567', status: 'PROPOSED',
      amountVnd: command.input.amountVnd })),
    decide: jest.fn(async command => ({ id: command.refundId, status: 'APPROVED' })),
    recordTransfer: jest.fn(async command => ({ id: command.refundId,
      status: command.outcome === 'UNKNOWN' ? 'TRANSFER_PENDING' : 'PAID' }))
  };
  const sessionService = {
    authenticate: async req => ({ userId: 'user-1', sessionId: 'session-1', state: 'ACTIVE',
      roles: [req.get('x-test-role') || 'CUSTOMER'], expiresAt: Date.now() + 60000 }),
    verifyCsrf: async (_auth, token) => token === 'csrf-test'
  };
  const app = createApp({ config: { trustProxyHops: 0, rateLimitWindowMs: 60000,
    rateLimitMax: 100, auth: { enabled: false } }, connection: {}, lifecycle: {}, env: {},
  moduleFactories: [
    () => refundProposalModule({ refundService, sessionService }),
    () => refundLifecycleModule({ refundService, sessionService })
  ] });
  const csrf = req => req.set('Host', '127.0.0.1')
    .set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', 'csrf-test')
    .set('Idempotency-Key', 'route-key-0001');
  return { app, refundService, csrf };
}

describe('refund routes', () => {
  test('allows an authenticated Staff proposal and returns the standard envelope', async () => {
    const { app, refundService, csrf } = setup();
    const response = await csrf(request(app).post('/api/v1/refund-proposals').set('x-test-role', 'STAFF'))
      .set('Idempotency-Key', 'route-key-0001')
      .send({ sourceRef: { type: 'CANCELLATION', id: 'booking-1' }, amountVnd: 25000, reason: 'Hồ sơ hợp lệ' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { status: 'PROPOSED', amountVnd: 25000 },
      meta: { schemaVersion: 1 } });
    expect(refundService.propose).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ roles: ['STAFF'] }), idempotencyKey: 'route-key-0001'
    }));
  });

  test('blocks Customer proposals and Staff decisions before reaching the service', async () => {
    const { app, refundService, csrf } = setup();
    const proposal = csrf(request(app).post('/api/v1/refund-proposals').set('x-test-role', 'CUSTOMER'))
      .send({ sourceRef: { type: 'CASE', id: 'case-1' }, amountVnd: 1000, reason: 'Yêu cầu' });
    const decision = csrf(request(app).post('/api/v1/refunds/0123456789abcdef01234567/decisions')
      .set('x-test-role', 'STAFF'))
      .send({ decision: 'APPROVE', reason: 'Duyệt', expectedVersion: 0 });
    const [proposalResponse, decisionResponse] = await Promise.all([proposal, decision]);
    expect(proposalResponse.status).toBe(403);
    expect(decisionResponse.status).toBe(403);
    expect(refundService.propose).not.toHaveBeenCalled();
    expect(refundService.decide).not.toHaveBeenCalled();
  });

  test('requires CSRF and rejects extra fields in commands', async () => {
    const { app, refundService, csrf } = setup();
    const noCsrf = await request(app).post('/api/v1/refund-proposals').set('x-test-role', 'STAFF')
      .set('Idempotency-Key', 'route-key-0002')
      .send({ sourceRef: { type: 'CASE', id: 'case-1' }, amountVnd: 1000, reason: 'Yêu cầu' });
    const extraField = await csrf(request(app).post('/api/v1/refund-proposals').set('x-test-role', 'STAFF'))
      .set('Idempotency-Key', 'route-key-0003')
      .send({ sourceRef: { type: 'CASE', id: 'case-1' }, amountVnd: 1000,
        reason: 'Yêu cầu', customerId: 'someone-else' });
    expect(noCsrf.status).toBe(403);
    expect(extraField.status).toBe(422);
    expect(refundService.propose).not.toHaveBeenCalled();
  });

  test('keeps an unknown transfer in a pending response', async () => {
    const { app, refundService, csrf } = setup();
    const response = await csrf(request(app).post('/api/v1/refunds/0123456789abcdef01234567/transfer-records')
      .set('x-test-role', 'ADMIN'))
      .set('Idempotency-Key', 'route-key-0004').send({ outcome: 'UNKNOWN', expectedVersion: 2 });
    expect(response.status).toBe(202);
    expect(response.body.data.status).toBe('TRANSFER_PENDING');
    expect(refundService.recordTransfer).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'UNKNOWN', expectedVersion: 2, idempotencyKey: 'route-key-0004'
    }));
  });
});
