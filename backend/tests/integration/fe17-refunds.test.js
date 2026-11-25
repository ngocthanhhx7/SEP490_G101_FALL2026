import express from 'express';
import request from 'supertest';
import { describe, expect, test } from '@jest/globals';
import { refundLifecycleModule, refundProposalModule } from '../../src/routes/refunds.routes.js';
import { createRefundService } from '../../src/services/refunds/refund.service.js';

const SESSION_EXPIRY = 4102444800000;
const STAFF = { userId: 'staff-fe17', sessionId: 'session-staff-fe17', roles: ['STAFF'], state: 'ACTIVE', expiresAt: SESSION_EXPIRY };
const ADMIN = { userId: 'admin-fe17', sessionId: 'session-admin-fe17', roles: ['ADMIN'], state: 'ACTIVE', expiresAt: SESSION_EXPIRY };
const SOURCE = { type: 'CASE', id: 'booking-fe17' };
const NOW = new Date('2026-11-25T00:00:00.000Z');

function createFixture({ capacityVnd = 300000 } = {}) {
  let committed = {
    capacity: capacityVnd,
    refunds: new Map(),
    commands: new Map(),
    reservations: new Map(),
    events: [],
    ledger: [],
    nextId: 1
  };
  let queue = Promise.resolve();
  const cloneValue = value => JSON.parse(JSON.stringify(value));
  const clone = state => ({
    capacity: state.capacity,
    refunds: new Map([...state.refunds].map(([id, value]) => [id, cloneValue(value)])),
    commands: new Map([...state.commands].map(([key, value]) => [key, cloneValue(value)])),
    reservations: new Map(state.reservations),
    events: state.events.map(value => ({ ...value })),
    ledger: state.ledger.map(value => ({ ...value })),
    nextId: state.nextId
  });
  const unitOfWork = {
    run(work) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      return previous.then(async () => {
        const transaction = { state: clone(committed) };
        try {
          const result = await work(transaction);
          committed = transaction.state;
          return result;
        } finally { release(); }
      });
    }
  };
  const refunds = {
    async findCommand({ actorId, operation, key }, tx) { return tx.state.commands.get(`${actorId}:${operation}:${key}`) ?? null; },
    async saveCommand({ actorId, operation, key, fingerprint, result }, tx) {
      tx.state.commands.set(`${actorId}:${operation}:${key}`, { fingerprint, result });
    },
    async create(record, tx) {
      const id = `refund-${String(tx.state.nextId++).padStart(4, '0')}`;
      const value = { id, ...record };
      tx.state.refunds.set(id, value);
      return value;
    },
    async getById(id, tx) { return tx.state.refunds.get(id) ?? null; },
    async compareAndSet(id, version, patch, tx) {
      const current = tx.state.refunds.get(id);
      if (!current || current.version !== version) return null;
      const updated = { ...current, ...patch };
      tx.state.refunds.set(id, updated);
      return updated;
    },
    async reserveRefundableAmount({ refundId, amountVnd }, tx) {
      if (tx.state.capacity < amountVnd) return false;
      tx.state.capacity -= amountVnd;
      tx.state.reservations.set(refundId, amountVnd);
      return true;
    },
    async settleRefundReservation({ refundId, amountVnd }, tx) {
      if (tx.state.reservations.get(refundId) !== amountVnd) return false;
      tx.state.reservations.delete(refundId);
      return true;
    },
    async releaseRefundReservation({ refundId, amountVnd }, tx) {
      if (tx.state.reservations.get(refundId) !== amountVnd) return false;
      tx.state.reservations.delete(refundId);
      tx.state.capacity += amountVnd;
      return true;
    },
    async appendEvent(event, tx) { tx.state.events.push(event); }
  };
  const service = createRefundService({
    unitOfWork,
    refunds,
    ledger: { append: async (entry, tx) => tx.state.ledger.push(entry) },
    capacity: { resolve: async () => ({ ready: true, bucket: 'REFUNDABLE_AVAILABLE', decisionIds: [], availableRefundableVnd: committed.capacity }) },
    authorizeSource: async ({ sourceRef }) => sourceRef.id === SOURCE.id,
    clock: () => NOW
  });
  const sessionService = {
    authenticate: async req => req.get('x-test-role') === 'STAFF' ? STAFF : req.get('x-test-role') === 'ADMIN' ? ADMIN : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
  };
  const app = express();
  app.use(express.json());
  const proposal = refundProposalModule({ refundService: service, sessionService });
  const lifecycle = refundLifecycleModule({ refundService: service, sessionService });
  app.use(proposal.mount, proposal.router);
  app.use(lifecycle.mount, lifecycle.router);
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code, messageCode: error.messageCode } }));
  const api = (role, method, path) => {
    const req = request(app)[method](path).set('x-test-role', role);
    if (method !== 'get') req.set('Origin', 'http://localhost').set('Host', 'localhost').set('X-CSRF-Token', 'synthetic-csrf');
    return req;
  };
  return { app, api, state: () => committed };
}

async function propose(fixture, key = 'fe17-proposal-01', amountVnd = 100000) {
  return fixture.api('STAFF', 'post', '/api/v1/refund-proposals/').set('Idempotency-Key', key)
    .send({ sourceRef: SOURCE, amountVnd, reason: 'Synthetic FE-17 refund', evidenceRefs: ['evidence-fe17'] });
}

describe('FE-17 UC-51 - Process Refund', () => {
  test.todo('IT-FE17-UC51-01 opens Refund Processing from the Admin menu');
  test.todo('IT-FE17-UC51-02 opens the matching proposal from a refund notification');
  test.todo('IT-FE17-UC51-03 lists Waiting refund proposals oldest first');
  test.todo('IT-FE17-UC51-04 shows Booking, Payment, previous refunds, reason, and evidence');

  test('IT-FE17-UC51-05 Admin approves a proposal within the refundable limit', async () => {
    const fixture = createFixture();
    const proposal = await propose(fixture);
    expect(proposal.status).toBe(201);
    const id = proposal.body.data.id;
    const decided = await fixture.api('ADMIN', 'post', `/api/v1/refunds/${id}/decisions`).set('Idempotency-Key', 'fe17-decision-05')
      .send({ decision: 'APPROVE', reason: 'Approved by Admin', expectedVersion: 0 }).expect(200);
    expect(decided.body.data).toMatchObject({ id, amountVnd: 100000, status: 'APPROVED', decision: { outcome: 'APPROVE' } });
    expect(fixture.state().ledger).toHaveLength(1);
    expect(fixture.state().capacity).toBe(200000);
  });

  test.todo('IT-FE17-UC51-06 Admin reduces the Staff proposal before approving');

  test('IT-FE17-UC51-07 rejects a proposal above the remaining refundable amount', async () => {
    const fixture = createFixture({ capacityVnd: 50000 });
    const response = await propose(fixture, 'fe17-over-cap-07', 50001);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('REFUND_LIMIT_EXCEEDED');
    expect(fixture.state().refunds.size).toBe(0);
  });

  test('IT-FE17-UC51-08 Admin rejects a proposal with a reason', async () => {
    const fixture = createFixture();
    const proposal = await propose(fixture, 'fe17-proposal-08');
    const response = await fixture.api('ADMIN', 'post', `/api/v1/refunds/${proposal.body.data.id}/decisions`).set('Idempotency-Key', 'fe17-decision-08')
      .send({ decision: 'REJECT', reason: 'Insufficient evidence', expectedVersion: 0 }).expect(200);
    expect(response.body.data).toMatchObject({ status: 'REJECTED', decision: { outcome: 'REJECT', reason: 'Insufficient evidence' } });
    expect(fixture.state().ledger).toHaveLength(0);
  });

  test('IT-FE17-UC51-09 requires a reason when Admin rejects', async () => {
    const fixture = createFixture();
    const proposal = await propose(fixture, 'fe17-proposal-09');
    const response = await fixture.api('ADMIN', 'post', `/api/v1/refunds/${proposal.body.data.id}/decisions`).set('Idempotency-Key', 'fe17-decision-09')
      .send({ decision: 'REJECT', reason: ' ', expectedVersion: 0 });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  test.todo('IT-FE17-UC51-10 shows the handled proposal in the Decided tab');
  test.todo('IT-FE17-UC51-11 lists an automatic refund after Visit cancellation');
  test.todo('IT-FE17-UC51-12 lists refunds for multiple cancelled Visits');
  test.todo('IT-FE17-UC51-13 records a late-confirmed payment Booking refund');
  test.todo('IT-FE17-UC51-14 records a full refund after a paid Product Order cancellation');
  test.todo('IT-FE17-UC51-15 records a refund after a paid Product Order return');
  test.todo('IT-FE17-UC51-16 records an accepted faulty-product refund for a prepaid order');
  test.todo('IT-FE17-UC51-17 records an accepted faulty-product refund for a COD order');
  test.todo('IT-FE17-UC51-18 switches between the four Refund Processing tabs');
  test.todo('IT-FE17-UC51-19 reloads Waiting after Staff submits a new proposal');

  test('IT-FE17-UC51-20 includes previously approved refunds in the remaining limit', async () => {
    const fixture = createFixture({ capacityVnd: 100000 });
    const first = await propose(fixture, 'fe17-proposal-20a', 70000);
    await fixture.api('ADMIN', 'post', `/api/v1/refunds/${first.body.data.id}/decisions`).set('Idempotency-Key', 'fe17-decision-20a')
      .send({ decision: 'APPROVE', reason: 'First refund', expectedVersion: 0 }).expect(200);
    const second = await propose(fixture, 'fe17-proposal-20b', 30001);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REFUND_LIMIT_EXCEEDED');
  });

  test('IT-FE17-UC51-21 prevents processing an approved proposal twice', async () => {
    const fixture = createFixture();
    const proposal = await propose(fixture, 'fe17-proposal-21');
    const path = `/api/v1/refunds/${proposal.body.data.id}/decisions`;
    await fixture.api('ADMIN', 'post', path).set('Idempotency-Key', 'fe17-decision-21').send({ decision: 'APPROVE', reason: 'Approve once', expectedVersion: 0 }).expect(200);
    const replay = await fixture.api('ADMIN', 'post', path).set('Idempotency-Key', 'fe17-decision-21-replay')
      .send({ decision: 'APPROVE', reason: 'Approve twice', expectedVersion: 0 });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('INVALID_STATE');
    expect(fixture.state().ledger).toHaveLength(1);
  });

  test('IT-FE17-UC51-22 records the external accounting transfer separately', async () => {
    const fixture = createFixture();
    const proposal = await propose(fixture, 'fe17-proposal-22');
    const id = proposal.body.data.id;
    await fixture.api('ADMIN', 'post', `/api/v1/refunds/${id}/decisions`).set('Idempotency-Key', 'fe17-decision-22')
      .send({ decision: 'APPROVE', reason: 'Approve for accounting', expectedVersion: 0 }).expect(200);
    const transfer = await fixture.api('ADMIN', 'post', `/api/v1/refunds/${id}/transfer-records`).set('Idempotency-Key', 'fe17-transfer-22')
      .send({ outcome: 'CONFIRMED', amountVnd: 100000, transferReference: 'accounting-fe17', evidenceReference: 'receipt-fe17', paidAt: NOW.toISOString(), expectedVersion: 1 }).expect(200);
    expect(transfer.body.data).toMatchObject({ status: 'PAID', transfer: { outcome: 'CONFIRMED', amountVnd: 100000, reference: 'accounting-fe17' } });
  });
});
