import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { createReviewRouter } from '../../src/routes/review.routes.js';
import { createReviewService } from '../../src/services/reviews/review.service.js';

const customer = { userId: 'customer-fe18', state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: Date.now() + 3600000 };
const sessionPort = {
  authenticate: async req => req.get('x-test-role') === 'CUSTOMER' ? customer : null,
  verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
};
const visits = new Map([['visit-fe18', {
  id: 'visit-fe18', visitId: 'visit-fe18', customerId: 'customer-fe18', sitterId: 'sitter-fe18',
  state: 'COMPLETED', version: 0
}]]);
const reviews = new Map();
const repository = {
  async runForVisitActor(_actor, visitId, work) {
    return work({
      getVisit: async () => visits.get(visitId),
      findReview: async ({ visitId: id }) => reviews.get(id),
      createReview: async value => { reviews.set(value.visitId, value); return value; },
      appendAuditAndOutbox: async () => undefined,
      getIdempotencyResult: async () => null,
      saveIdempotencyResult: async () => undefined
    });
  }
};

const app = express();
app.use(express.json());
app.use('/api/v1/reviews', createReviewRouter({
  service: createReviewService({ repository, clock: () => new Date('2026-11-25T00:00:00.000Z') }),
  sessionService: sessionPort,
  allowedOrigins: ['http://localhost']
}));
app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code } }));

const csrf = key => request(app).post('/api/v1/reviews/visits/visit-fe18/ratings')
  .set('x-test-role', 'CUSTOMER').set('Origin', 'http://localhost').set('Host', 'localhost')
  .set('X-CSRF-Token', 'synthetic-csrf').set('Idempotency-Key', key);

describe('FE-18 UC-87 - Rate Visit', () => {
  beforeEach(() => reviews.clear());
  test('IT-FE18-UC87-01 Customer rates a completed Visit with a valid score and comment', async () => {
    const response = await csrf('fe18-rating-01').send({ rating: 5, comment: 'Great care' }).expect(201);
    expect(response.body.data.review).toMatchObject({ rating: 5, comment: 'Great care', state: 'SUBMITTED' });
  });

  test('IT-FE18-UC87-02 rejects a rating outside the 1-5 range', async () => {
    await request(app).post('/api/v1/reviews/visits/visit-invalid/ratings').set('x-test-role', 'CUSTOMER')
      .set('Origin', 'http://localhost').set('Host', 'localhost').set('X-CSRF-Token', 'synthetic-csrf')
      .set('Idempotency-Key', 'fe18-rating-02').send({ rating: 6 }).expect(422);
  });

  test('IT-FE18-UC87-04 rejects a duplicate rating for the same Visit', async () => {
    await csrf('fe18-rating-seed').send({ rating: 4 }).expect(201);
    await csrf('fe18-rating-04').send({ rating: 4 }).expect(409);
  });

  test.todo('IT-FE18-UC87-03 rejects rating after the seven-day review window');
  test.todo('IT-FE18-UC87-05 rejects a sitter with no completed Visit in the Booking');
  test.todo('IT-FE18-UC87-06 publishes the new rating on the Pet Sitter Profile');
  test.todo('IT-FE18-UC87-07 updates the Pet Sitter List rating aggregate');
});

describe('FE-18 UC-52 - Submit Complaint', () => {
  test.todo('IT-FE18-UC52-01 submits a timely completed-Visit complaint and notifies Staff');
  test.todo('IT-FE18-UC52-02 submits a complaint for a Staff-closed Visit within seven days');
  test.todo('IT-FE18-UC52-03 rejects a complaint after the seven-day window');
  test.todo('IT-FE18-UC52-04 submits a whole-Booking complaint within seven days');
  test.todo('IT-FE18-UC52-05 rejects a cancelled Booking without a late-cancellation hold');
  test.todo('IT-FE18-UC52-06 allows a cancelled Booking with a late-cancellation hold');
  test.todo('IT-FE18-UC52-07 rejects a second Open complaint for the same Visit');
  test.todo('IT-FE18-UC52-08 rejects another whole-Booking Open complaint');
  test.todo('IT-FE18-UC52-09 stores valid complaint evidence and exposes it to Staff');
  test.todo('IT-FE18-UC52-10 routes an in-Visit issue to Report Incident');
  test.todo('IT-FE18-UC52-11 lists the Customer My Complaints view newest first');
  test.todo('IT-FE18-UC52-12 escalates one objection within 72 hours');
  test.todo('IT-FE18-UC52-13 rejects a second objection for the same result');
  test.todo('IT-FE18-UC52-14 rejects an objection after 72 hours and keeps Final state');
});

describe('FE-18 UC-53 - Handle Complaint', () => {
  test.todo('IT-FE18-UC53-01 Staff opens an Open complaint with related records');
  test.todo('IT-FE18-UC53-02 Staff searches complaints by complaint, Booking, or Customer');
  test.todo('IT-FE18-UC53-03 Staff resolves a complaint without a refund proposal');
  test.todo('IT-FE18-UC53-04 Staff proposes a valid refund and keeps the complaint Open');
  test.todo('IT-FE18-UC53-05 rejects a refund above the Customer payment total');
  test.todo('IT-FE18-UC53-06 Admin approves the full proposed refund');
  test.todo('IT-FE18-UC53-07 Admin approves a reduced refund amount');
  test.todo('IT-FE18-UC53-08 Admin rejects a refund proposal with a reason');
  test.todo('IT-FE18-UC53-09 Admin reviews an Escalated complaint and the objection reason');
  test.todo('IT-FE18-UC53-10 recalculates Refund after an Admin amount change');
  test.todo('IT-FE18-UC53-11 Admin makes the final decision for an Escalated complaint');
  test.todo('IT-FE18-UC53-12 marks complaints open for more than three days for the Admin Dashboard');
  test.todo('IT-FE18-UC53-13 keeps Escalated complaints in the Admin decision flow');
  test.todo('IT-FE18-UC53-14 keeps a pending-refund complaint Open until Admin decides');
});
