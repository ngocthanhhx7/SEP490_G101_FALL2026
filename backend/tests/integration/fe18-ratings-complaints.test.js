import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { createComplaintRouter } from '../../src/routes/complaint.routes.js';
import { createReviewRouter } from '../../src/routes/review.routes.js';
import { createComplaintService } from '../../src/services/complaints/complaint.service.js';
import { createReviewService } from '../../src/services/reviews/review.service.js';

const customer = { userId: 'customer-fe18', state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: Date.now() + 3600000 };
const staff = { userId: 'staff-fe18', state: 'ACTIVE', roles: ['STAFF'], expiresAt: Date.now() + 3600000 };
const sessionPort = {
  authenticate: async req => req.get('x-test-role') === 'CUSTOMER' ? customer
    : req.get('x-test-role') === 'STAFF' ? staff : null,
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

const complaintBooking = { id: 'booking-fe18', customerId: customer.userId, state: 'COMPLETED', version: 2 };
const complaintVisit = { id: 'complaint-visit-fe18', bookingId: complaintBooking.id, customerId: customer.userId,
  sitterId: 'sitter-fe18', state: 'COMPLETED', version: 1, completedAt: new Date('2026-11-20T00:00:00.000Z') };
const complaintState = { records: [], events: [], commands: new Map(), holds: [] };
const complaintTx = {
  getBooking: async id => id === complaintBooking.id ? complaintBooking : null,
  getVisit: async id => id === complaintVisit.id ? complaintVisit : null,
  getVisits: async () => [complaintVisit],
  bookingComplaints: async () => complaintState.records,
  bookingIncidents: async () => [],
  getComplaint: async id => complaintState.records.find(record => record.id === id) ?? null,
  assertEvidence: async () => undefined,
  changeHold: async (_booking, complaintId) => complaintState.holds.push(complaintId),
  createComplaint: async record => { complaintState.records.push(record); return record; },
  guardBooking: async booking => booking,
  updateComplaint: async ({ complaintId, expectedVersion, changes }) => {
    const index = complaintState.records.findIndex(record => record.id === complaintId && record.version === expectedVersion);
    if (index < 0) return null;
    complaintState.records[index] = { ...complaintState.records[index], ...changes, version: expectedVersion + 1 };
    return complaintState.records[index];
  },
  getIdempotencyResult: async identity => complaintState.commands.get(JSON.stringify(identity)) ?? null,
  saveIdempotencyResult: async ({ identity, payloadHash, result }) =>
    complaintState.commands.set(JSON.stringify(identity), { payloadHash, result }),
  recordEvent: async ({ event }) => complaintState.events.push(event)
};
const complaintRepository = { run: async work => work(complaintTx) };

const app = express();
app.use(express.json());
app.use('/api/v1/reviews', createReviewRouter({
  service: createReviewService({ repository, clock: () => new Date('2026-11-25T00:00:00.000Z') }),
  sessionService: sessionPort,
  allowedOrigins: ['http://localhost']
}));
app.use('/api/v1/complaints', createComplaintRouter({
  service: createComplaintService({ repository: complaintRepository,
    clock: () => new Date('2026-11-25T00:00:00.000Z') }),
  sessionService: sessionPort,
  allowedOrigins: ['http://localhost']
}));
app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code } }));

const csrf = key => request(app).post('/api/v1/reviews/visits/visit-fe18/ratings')
  .set('x-test-role', 'CUSTOMER').set('Origin', 'http://localhost').set('Host', 'localhost')
  .set('X-CSRF-Token', 'synthetic-csrf').set('Idempotency-Key', key);

const complaintRequest = (role, path, key) => request(app).post(`/api/v1/complaints${path}`)
  .set('x-test-role', role).set('Origin', 'http://localhost').set('Host', 'localhost')
  .set('X-CSRF-Token', 'synthetic-csrf').set('Idempotency-Key', key);

function resetComplaintState() {
  complaintState.records.length = 0;
  complaintState.events.length = 0;
  complaintState.commands.clear();
  complaintState.holds.length = 0;
}

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
  beforeEach(resetComplaintState);
  test('IT-FE18-UC52-01 submits a timely completed-Visit complaint and notifies Staff', async () => {
    const response = await complaintRequest('CUSTOMER', `/visits/${complaintVisit.id}`, 'fe18-complaint-01')
      .send({ expectedVersion: 1, description: 'Complaint for the completed Visit' }).expect(201);
    expect(response.body.data).toMatchObject({ visitId: complaintVisit.id, state: 'OPEN', version: 0 });
    expect(complaintState.records).toHaveLength(1);
    expect(complaintState.records[0]).toMatchObject({ bookingId: complaintBooking.id,
      visitId: complaintVisit.id, customerId: customer.userId, state: 'OPEN', billState: 'ON_HOLD' });
    expect(complaintState.holds).toEqual([response.body.data.complaintId]);
    expect(complaintState.events).toEqual(['ComplaintOpened']);
  });
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
  beforeEach(resetComplaintState);
  test.todo('IT-FE18-UC53-01 Staff opens an Open complaint with related records');
  test.todo('IT-FE18-UC53-02 Staff searches complaints by complaint, Booking, or Customer');
  test('IT-FE18-UC53-03 Staff resolves a complaint without a refund proposal', async () => {
    const opened = await complaintRequest('CUSTOMER', `/visits/${complaintVisit.id}`, 'fe18-complaint-53-03')
      .send({ expectedVersion: 1, description: 'Complaint that Staff can resolve' }).expect(201);
    const complaintId = opened.body.data.complaintId;
    expect(complaintState.records[0]).toMatchObject({ state: 'OPEN', version: 0 });

    await complaintRequest('CUSTOMER', `/${complaintId}/resolution`, 'fe18-resolution-denied')
      .send({ expectedVersion: 0, handlingNotes: 'Private handling', customerResult: 'Resolved' }).expect(403);
    expect(complaintState.records[0]).toMatchObject({ state: 'OPEN', version: 0 });

    const resolved = await complaintRequest('STAFF', `/${complaintId}/resolution`, 'fe18-resolution-53-03')
      .send({ expectedVersion: 0, handlingNotes: 'Verified the Visit evidence',
        customerResult: 'The complaint was handled without a refund' }).expect(200);
    expect(resolved.body.data).toMatchObject({ complaintId, state: 'RESOLVED', version: 1,
      complaint: { state: 'RESOLVED', customerResult: 'The complaint was handled without a refund' } });
    expect(complaintState.records[0]).toMatchObject({ state: 'RESOLVED', version: 1,
      handlingNotes: 'Verified the Visit evidence' });
    expect(complaintState.events).toEqual(['ComplaintOpened', 'ComplaintResolved']);
  });
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
