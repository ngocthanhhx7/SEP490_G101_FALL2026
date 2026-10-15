import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';
import { createComplaintRouter } from '../../src/routes/complaint.routes.js';
import { createReviewRouter } from '../../src/routes/review.routes.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';

const visitId = 'visit-1'; const caseId = 'case-1';
function setup(role = 'CUSTOMER') {
  const service = {
    rateVisit: jest.fn(async input => ({ visitId: input.visitId, state: 'SUBMITTED', review: { id: 'review-1', visitId: input.visitId, rating: input.rating, state: 'SUBMITTED' } })),
    submit: jest.fn(async input => ({ complaintId: caseId, complaint: { id: caseId, kind: 'COMPLAINT', visitId: input.visitId, state: 'OPEN', version: 0 } })),
    list: jest.fn(async () => ({ items: [], nextCursor: null })),
    get: jest.fn(async () => ({ id: caseId, kind: 'COMPLAINT', visitId, state: 'OPEN', version: 0 })),
    review: jest.fn(async () => ({ id: caseId, kind: 'COMPLAINT', visitId, state: 'UNDER_REVIEW', version: 1 })),
    resolve: jest.fn(async () => ({ id: caseId, kind: 'COMPLAINT', visitId, state: 'RESOLVED', version: 2 })),
    object: jest.fn(async () => ({ id: caseId, kind: 'COMPLAINT', visitId, state: 'UNDER_REVIEW', version: 3 })),
    decide: jest.fn(async () => ({ id: caseId, kind: 'COMPLAINT', visitId, state: 'CLOSED', version: 4 }))
  };
  const sessionPort = {
    authenticate: async () => ({ userId: 'user-1', sessionId: 'session-1', state: 'ACTIVE', roles: [role], expiresAt: Date.now() + 60000 }),
    verifyCsrf: async (_actor, token) => token === 'csrf-test'
  };
  const app = express(); app.use(express.json(), requestId);
  app.use('/api/v1/reviews', createReviewRouter({ service, sessionPort, allowedOrigins: ['https://pwc.example.invalid'] }));
  app.use('/api/v1/complaints', createComplaintRouter({ service, sessionPort, allowedOrigins: ['https://pwc.example.invalid'] }));
  app.use(errorHandler(() => {}));
  return { app, service };
}
const csrf = requestBuilder => requestBuilder.set('Origin', 'https://pwc.example.invalid').set('X-CSRF-Token', 'csrf-test').set('Idempotency-Key', 'route-key-0001');

describe('P30 export-only review and complaint routers', () => {
  test('Customer rating forwards server actor, visit and idempotency key', async () => {
    const { app, service } = setup('CUSTOMER');
    const response = await csrf(request(app).post(`/api/v1/reviews/visits/${visitId}`)).send({ expectedVersion: 2, rating: 5 });
    expect(response.status).toBe(201); expect(response.body.meta.schemaVersion).toBe(1);
    expect(service.rateVisit).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: 'user-1' }), visitId, rating: 5, idempotencyKey: 'route-key-0001' }));
  });

  test('Customer complaint submit rejects extra owner fields and missing CSRF', async () => {
    const { app, service } = setup('CUSTOMER');
    const noCsrf = await request(app).post(`/api/v1/complaints/visits/${visitId}`).send({ summary: 'x', description: 'y' });
    const extra = await csrf(request(app).post(`/api/v1/complaints/visits/${visitId}`)).send({ summary: 'x', description: 'y', customerId: 'other' });
    expect(noCsrf.status).toBe(403); expect(extra.status).toBe(422); expect(service.submit).not.toHaveBeenCalled();
  });

  test.each(['STAFF', 'ADMIN', 'CUSTOMER'])('%s may resolve only when operational', async role => {
    const { app, service } = setup(role);
    const response = await csrf(request(app).post(`/api/v1/complaints/${caseId}/resolution`)).send({ expectedVersion: 0, summary: 'Đã xử lý' });
    expect(response.status).toBe(role === 'CUSTOMER' ? 403 : 200);
    expect(service.resolve).toHaveBeenCalledTimes(role === 'CUSTOMER' ? 0 : 1);
  });

  test('Admin decision route stays unavailable to Staff', async () => {
    const { app, service } = setup('STAFF');
    const response = await csrf(request(app).post(`/api/v1/complaints/${caseId}/decision`)).send({ expectedVersion: 1, summary: 'Cuối' });
    expect(response.status).toBe(403); expect(service.decide).not.toHaveBeenCalled();
  });

  test('Sitter can read complaint list/detail but cannot create a complaint', async () => {
    const { app, service } = setup('PET_SITTER');
    const list = await request(app).get('/api/v1/complaints');
    const detail = await request(app).get(`/api/v1/complaints/${caseId}`);
    const create = await csrf(request(app).post(`/api/v1/complaints/visits/${visitId}`)).send({ summary: 'x', description: 'y' });
    expect(list.status).toBe(200); expect(detail.status).toBe(200); expect(create.status).toBe(403);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ roles: ['PET_SITTER'] }) }));
    expect(service.get).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ roles: ['PET_SITTER'] }), complaintId: caseId }));
    expect(service.submit).not.toHaveBeenCalled();
  });
});
