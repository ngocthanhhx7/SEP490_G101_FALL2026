import express from 'express';
import request from 'supertest';
import { describe, expect, test } from '@jest/globals';
import { createIncidentRouter } from '../../src/routes/incident.routes.js';
import { createIncidentService } from '../../src/services/incidents/incident.service.js';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const ACTORS = {
  customer: { userId: 'customer-fe15', sessionId: 'session-customer-fe15', roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: 4102444800000 },
  sitter: { userId: 'sitter-fe15', sessionId: 'session-sitter-fe15', roles: ['PET_SITTER'], state: 'ACTIVE', expiresAt: 4102444800000 },
  other: { userId: 'other-fe15', sessionId: 'session-other-fe15', roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: 4102444800000 },
  staff: { userId: 'staff-fe15', sessionId: 'session-staff-fe15', roles: ['STAFF'], state: 'ACTIVE', expiresAt: 4102444800000 },
  admin: { userId: 'admin-fe15', sessionId: 'session-admin-fe15', roles: ['ADMIN'], state: 'ACTIVE', expiresAt: 4102444800000 }
};

function createFixture() {
  const state = {
    visits: new Map([['visit-fe15', { id: 'visit-fe15', customerId: ACTORS.customer.userId, sitterId: ACTORS.sitter.userId, state: 'IN_PROGRESS', version: 0 }]]),
    incidents: new Map(), operations: new Map(), events: [], nextId: 1
  };
  const tx = {
    async getVisit(id) { return state.visits.get(id) ?? null; },
    async getCase(id) { return state.incidents.get(id) ?? null; },
    async createIncident(record) {
      const value = { ...record, id: `incident-fe15-${state.nextId++}` };
      state.incidents.set(value.id, value);
      return value;
    },
    async resolveIncident({ caseId, resolution, expectedVersion }) {
      const current = state.incidents.get(caseId);
      if (!current || current.version !== expectedVersion) return null;
      const value = { ...current, state: resolution.state, version: expectedVersion + 1, resolution,
        ...(resolution.targetState === 'RESOLVED' ? { resolvedAt: resolution.recordedAt } : {}) };
      state.incidents.set(caseId, value);
      return value;
    },
    async getIdempotencyResult(identity) { return state.operations.get(`${identity.actorRef}:${identity.resourceRef}:${identity.operation}:${identity.key}`) ?? null; },
    async saveIdempotencyResult({ identity, payloadHash, result }) { state.operations.set(`${identity.actorRef}:${identity.resourceRef}:${identity.operation}:${identity.key}`, { payloadHash, result }); },
    async appendAuditAndOutbox(event) { state.events.push(event); },
    async listIncidents({ filter }) {
      return { items: [...state.incidents.values()].filter(item => (!filter.visitId || item.visitId === filter.visitId)
        && (!filter.state || item.state === filter.state)), nextCursor: null };
    }
  };
  const repository = {
    async runForVisitActor(_actor, visitId, work) { return work(tx, visitId); },
    async runForCase(_actor, caseId, work) { return work(tx, caseId); }
  };
  const service = createIncidentService({ repository, clock: () => NOW });
  const sessionPort = { authenticate: async req => ACTORS[req.get('x-test-actor')] ?? null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const app = express(); app.use(express.json());
  app.use('/api/v1', createIncidentRouter({ service, sessionPort, allowedOrigins: ['http://localhost'], clock: () => NOW.getTime() }));
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code, details: error.details } }));
  const api = (actor, method, path) => {
    const req = request(app)[method](path).set('x-test-actor', actor);
    if (method !== 'get') req.set('Origin', 'http://localhost').set('Host', 'localhost').set('X-CSRF-Token', 'synthetic-csrf');
    return req;
  };
  const report = (actor = 'customer', key = 'fe15-report-01', body = {}) => api(actor, 'post', '/api/v1/visits/visit-fe15/incidents')
    .set('Idempotency-Key', key).send({ severity: 'HIGH', category: 'SAFETY', description: 'Synthetic incident report', ...body });
  return { api, report, state };
}

function resolve(fixture, actor, incidentId, key, body = {}) {
  return fixture.api(actor, 'post', `/api/v1/incidents/${incidentId}/resolutions`).set('Idempotency-Key', key)
    .send({ expectedVersion: body.expectedVersion ?? 0, targetState: body.targetState ?? 'RESOLVED', summary: body.summary ?? 'Synthetic resolution',
      actionsTaken: body.actionsTaken ?? 'Contacted the involved parties', customerContacted: true, veterinaryContacted: false, ...body });
}

describe('FE-15 UC-47/UC-48 - Incident Handling', () => {
  test('IT-FE15-UC47-01 Customer reports a valid Incident for their Visit', async () => {
    const fixture = createFixture();
    const response = await fixture.report().expect(201);
    expect(response.body.data).toMatchObject({ visitId: 'visit-fe15', state: 'OPEN', incident: { kind: 'INCIDENT', state: 'OPEN' } });
    expect(fixture.state.events).toContainEqual(expect.objectContaining({ type: 'IncidentReported', actorId: ACTORS.customer.userId }));
  });

  test('IT-FE15-UC47-02 Pet Sitter reports a valid Incident for an assigned Visit', async () => {
    const fixture = createFixture();
    const response = await fixture.report('sitter', 'fe15-report-02', { description: 'Pet sitter observed a safety issue' }).expect(201);
    expect(response.body.data.incident).toMatchObject({ visitId: 'visit-fe15', description: 'Pet sitter observed a safety issue' });
    expect(fixture.state.incidents.size).toBe(1);
  });

  test('IT-FE15-UC47-03 Customer reports an Incident with category, description, and evidence', async () => {
    const fixture = createFixture();
    const response = await fixture.report('customer', 'fe15-report-03', { category: 'HEALTH_OBSERVATION', description: 'Pet has a visible injury', evidenceRefs: [{ mediaId: 'media-fe15-01', caption: 'Synthetic photo' }] }).expect(201);
    expect(response.body.data.incident).toMatchObject({ category: 'HEALTH_OBSERVATION', evidenceRefs: [{ mediaId: 'media-fe15-01' }] });
  });

  test('IT-FE15-UC47-04 rejects an Incident without the required description', async () => {
    const fixture = createFixture();
    const response = await fixture.report('customer', 'fe15-report-04', { description: ' ' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(fixture.state.incidents.size).toBe(0);
  });

  test('IT-FE15-UC47-05 rejects a report for a Visit outside the actor scope', async () => {
    const fixture = createFixture();
    const response = await fixture.api('other', 'post', '/api/v1/visits/visit-fe15/incidents').set('Idempotency-Key', 'fe15-report-05')
      .send({ severity: 'HIGH', description: 'Unauthorized report' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(fixture.state.incidents.size).toBe(0);
  });

  test.todo('IT-FE15-UC47-06 lets a Pet Sitter report inability to enter instead of Check In');
  test.todo('IT-FE15-UC47-07 shows MSG43 for a sick or injured pet report');
  test.todo('IT-FE15-UC47-08 routes unresolved access failure to UC-39 Visit cancellation');

  test('IT-FE15-UC48-01 Staff opens an Open Incident and sees safe Visit/report details', async () => {
    const fixture = createFixture();
    const created = await fixture.report('customer', 'fe15-detail-01').expect(201);
    const response = await fixture.api('staff', 'get', `/api/v1/incidents/${created.body.data.id}`).expect(200);
    expect(response.body.data).toMatchObject({ id: created.body.data.id, visitId: 'visit-fe15', kind: 'INCIDENT', state: 'OPEN', description: 'Synthetic incident report' });
  });

  test('IT-FE15-UC48-02 Staff adds a handling action and moves Incident to In progress', async () => {
    const fixture = createFixture();
    const created = await fixture.report('customer', 'fe15-action-02').expect(201);
    const response = await resolve(fixture, 'staff', created.body.data.id, 'fe15-resolve-02', { targetState: 'UNDER_REVIEW', summary: 'Staff contacted Customer' }).expect(200);
    expect(response.body.data).toMatchObject({ state: 'UNDER_REVIEW', version: 1, resolution: { summary: 'Staff contacted Customer' } });
  });

  test('IT-FE15-UC48-03 Staff records multiple handling actions in chronological order', async () => {
    const fixture = createFixture();
    const created = await fixture.report('customer', 'fe15-action-03').expect(201);
    await resolve(fixture, 'staff', created.body.data.id, 'fe15-review-03', { targetState: 'UNDER_REVIEW', summary: 'First action' }).expect(200);
    const response = await resolve(fixture, 'staff', created.body.data.id, 'fe15-resolve-03', { expectedVersion: 1, summary: 'Second action' }).expect(200);
    expect(response.body.data).toMatchObject({ state: 'RESOLVED', version: 2, resolution: { summary: 'Second action' } });
  });

  test('IT-FE15-UC48-04 requires a result when Staff resolves an Incident', async () => {
    const fixture = createFixture();
    const created = await fixture.report('customer', 'fe15-result-04').expect(201);
    const response = await resolve(fixture, 'staff', created.body.data.id, 'fe15-resolve-04', { summary: ' ' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('IT-FE15-UC48-05 Staff resolves an Incident without a refund proposal', async () => {
    const fixture = createFixture();
    const created = await fixture.report('customer', 'fe15-resolve-05').expect(201);
    await resolve(fixture, 'staff', created.body.data.id, 'fe15-review-05-key', { targetState: 'UNDER_REVIEW', summary: 'Review started' }).expect(200);
    const response = await resolve(fixture, 'staff', created.body.data.id, 'fe15-resolve-05-key', { expectedVersion: 1 }).expect(200);
    expect(response.body.data).toMatchObject({ state: 'RESOLVED', resolution: { targetState: 'RESOLVED' } });
  });

  test('IT-FE15-UC48-06 prevents Staff from applying a financial decision directly', async () => {
    const fixture = createFixture();
    const created = await fixture.report('customer', 'fe15-finance-06').expect(201);
    const response = await resolve(fixture, 'staff', created.body.data.id, 'fe15-finance-06-key', {
      financialDecision: { decision: 'NO_FINANCIAL_ACTION', reason: 'Staff cannot waive the Visit fee' }
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  test.todo('IT-FE15-UC48-07 sends a valid Incident refund proposal to Admin through UC-51');
  test.todo('IT-FE15-UC48-08 rejects a refund proposal above the paid Booking amount with MSG44');
  test.todo('IT-FE15-UC48-09 Admin approves an Incident refund proposal');
  test.todo('IT-FE15-UC48-10 Admin reduces the Incident refund proposal');
  test.todo('IT-FE15-UC48-11 Admin rejects an Incident refund proposal');
  test.todo('IT-FE15-UC48-12 sends a Pet Sitter suspension proposal to Admin through UC-19');
  test.todo('IT-FE15-UC48-13 routes access failure to UC-39 Visit cancellation');
  test.todo('IT-FE15-UC48-14 lets Customer submit a Complaint after disagreeing with Incident result');
  test.todo('IT-FE15-UC48-15 keeps Incident pending while Admin has not decided the refund');
  test.todo('IT-FE15-UC48-16 records an agreed out-of-system compensation in Result');
});
