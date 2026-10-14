import express from 'express';
import request from 'supertest';
import { expect, jest, test } from '@jest/globals';
import { AppError, errorPayload } from '../../src/utils/app-error.js';
import { customerAddressesModule, visitAccessNotesModule } from '../../src/routes/customer-address.routes.js';

const CUSTOMER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SITTER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const VISIT_ID = 'cccccccccccccccccccccccc';
const addressPage = { addresses: [], nextCursor: null, limit: 20 };

function testApplication({ actor, service }) {
  const app = express();
  app.use(express.json());
  const requireAuthenticated = (req, _res, next) => {
    if (!actor) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    req.auth = Object.freeze(actor);
    return next();
  };
  const requireCsrf = (req, _res, next) => {
    if (req.get('x-csrf-token') !== 'synthetic-csrf-token') {
      return next(new AppError(403, 'CSRF_REJECTED', 'Request verification failed'));
    }
    return next();
  };

  const addressModule = customerAddressesModule({ service, requireAuthenticated, requireCsrf });
  const accessModule = visitAccessNotesModule({ service, requireAuthenticated });
  app.use(addressModule.mount, addressModule.router);
  app.use(accessModule.mount, accessModule.router);
  app.use((error, req, res, _next) => {
    res.status(error.status ?? 500).json(errorPayload(req,
      error.code ?? 'INTERNAL_ERROR', error.message ?? 'Request failed', error.details ?? {}));
  });
  return app;
}

function addressService(overrides = {}) {
  return {
    list: jest.fn().mockResolvedValue(addressPage),
    create: jest.fn().mockResolvedValue({ id: 'dddddddddddddddddddddddd' }),
    update: jest.fn().mockResolvedValue({ id: 'dddddddddddddddddddddddd' }),
    archive: jest.fn().mockResolvedValue({ id: 'dddddddddddddddddddddddd', state: 'ARCHIVED' }),
    accessNotes: jest.fn().mockResolvedValue({ visitId: VISIT_ID, privateAccessNotes: 'Synthetic access note' }),
    ...overrides
  };
}

const customer = { userId: CUSTOMER_ID, roles: ['CUSTOMER'], state: 'ACTIVE' };
const sitter = { userId: SITTER_ID, roles: ['PET_SITTER'], state: 'ACTIVE' };

test('customer list route applies customer role and forwards bounded query', async () => {
  const service = addressService();
  const response = await request(testApplication({ actor: customer, service }))
    .get('/api/v1/addresses?limit=20&cursor=cursor-1').expect(200);
  expect(response.body.data).toEqual(addressPage);
  expect(service.list).toHaveBeenCalledWith(customer, { limit: '20', cursor: 'cursor-1' });

  const staffService = addressService();
  await request(testApplication({ actor: { ...customer, roles: ['STAFF'] }, service: staffService }))
    .get('/api/v1/addresses').expect(403);
  expect(staffService.list).not.toHaveBeenCalled();
});

test('mutating routes require CSRF and pass idempotency key to service', async () => {
  const service = addressService();
  const app = testApplication({ actor: customer, service });
  await request(app).post('/api/v1/addresses').send({ label: 'Home', location: 'Synthetic Road' }).expect(403);
  expect(service.create).not.toHaveBeenCalled();

  await request(app).post('/api/v1/addresses')
    .set('x-csrf-token', 'synthetic-csrf-token').set('Idempotency-Key', 'create-address-001')
    .send({ label: 'Home', location: 'Synthetic Road' }).expect(201);
  expect(service.create).toHaveBeenCalledWith(customer,
    { label: 'Home', location: 'Synthetic Road' }, 'create-address-001');

  await request(app).patch('/api/v1/addresses/dddddddddddddddddddddddd')
    .set('x-csrf-token', 'synthetic-csrf-token').set('Idempotency-Key', 'update-address-001')
    .send({ label: 'Home', expectedVersion: 0 }).expect(200);
  expect(service.update).toHaveBeenCalledWith(customer, 'dddddddddddddddddddddddd',
    { label: 'Home', expectedVersion: 0 }, 'update-address-001');
});

test('archive route is owner protected and sitter note route is sitter protected', async () => {
  const customerService = addressService();
  const app = testApplication({ actor: customer, service: customerService });
  await request(app).post('/api/v1/addresses/dddddddddddddddddddddddd/archives')
    .set('x-csrf-token', 'synthetic-csrf-token').set('Idempotency-Key', 'archive-address-001')
    .send({ expectedVersion: 1 }).expect(200);
  expect(customerService.archive).toHaveBeenCalledWith(customer, 'dddddddddddddddddddddddd',
    { expectedVersion: 1 }, 'archive-address-001');

  const sitterService = addressService();
  const sitterApp = testApplication({ actor: sitter, service: sitterService });
  const response = await request(sitterApp).get(`/api/v1/visits/${VISIT_ID}/access-notes`).expect(200);
  expect(response.body.data).toEqual({ visitId: VISIT_ID, privateAccessNotes: 'Synthetic access note' });
  expect(sitterService.accessNotes).toHaveBeenCalledWith(sitter, VISIT_ID);

  const customerResponse = await request(app).get(`/api/v1/visits/${VISIT_ID}/access-notes`).expect(403);
  expect(customerResponse.body.error.code).toBe('FORBIDDEN');
  expect(sitterService.accessNotes).toHaveBeenCalledTimes(1);
});

test('missing session is rejected before reading owner resources', async () => {
  const service = addressService();
  await request(testApplication({ actor: null, service })).get('/api/v1/addresses').expect(401);
  expect(service.list).not.toHaveBeenCalled();
});
