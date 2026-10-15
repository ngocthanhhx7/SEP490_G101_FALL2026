import express from 'express';
import request from 'supertest';
import { expect, jest, test } from '@jest/globals';
import { createReviewRouter } from '../../src/routes/review.routes.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';

function appFor(role) {
  const service = { rateVisit: jest.fn(), rateCustomer: jest.fn(async input => ({ visitId: input.visitId, review: { id: 'review-1', visitId: input.visitId, direction: 'SITTER_TO_CUSTOMER', rating: input.rating, state: 'SUBMITTED' } })) };
  const sessionPort = { authenticate: async () => ({ userId: 'sitter-1', sessionId: 'session-1', state: 'ACTIVE', roles: [role], expiresAt: Date.now() + 60000 }), verifyCsrf: async (_actor, token) => token === 'csrf-test' };
  const app = express(); app.use(express.json(), requestId); app.use('/api/v1/reviews', createReviewRouter({ service, sessionPort, allowedOrigins: ['https://pwc.example.invalid'] })); app.use(errorHandler(() => {}));
  return { app, service };
}
const csrf = requestBuilder => requestBuilder.set('Origin', 'https://pwc.example.invalid').set('X-CSRF-Token', 'csrf-test').set('Idempotency-Key', 'sitter-key-1');

test('PET_SITTER route forwards the sitter direction rating', async () => {
  const { app, service } = appFor('PET_SITTER');
  const response = await csrf(request(app).post('/api/v1/reviews/sitter/visits/visit-1')).send({ expectedVersion: 4, rating: 5 });
  expect(response.status).toBe(201); expect(service.rateCustomer).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: 'sitter-1' }), visitId: 'visit-1', rating: 5 }));
});

test('Customer cannot use the sitter rating route', async () => {
  const { app, service } = appFor('CUSTOMER');
  const response = await csrf(request(app).post('/api/v1/reviews/sitter/visits/visit-1')).send({ rating: 5 });
  expect(response.status).toBe(403); expect(service.rateCustomer).not.toHaveBeenCalled();
});
