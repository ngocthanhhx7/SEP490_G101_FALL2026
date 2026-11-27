import { jest, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { counterBookingRuntimeModule } from '../../src/routes/counter-booking.routes.js';
import { errorHandler } from '../../src/middlewares/http.js';

const STAFF = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const roles = Object.freeze({
  staff: ['SALE_STAFF'], admin: ['ADMIN'], customer: ['CUSTOMER'],
  employee: ['STAFF'], sitter: ['PET_SITTER']
});
function fixture(enabled = true) {
  const now = Date.now();
  const directory = {
    services: jest.fn(async () => ({ services: [{ id: 'service', name: 'Grooming' }] })),
    petCatalog: jest.fn(async () => ({ breeds: [], traits: [] })),
    lookup: jest.fn(async () => ({ customer: null })),
    createCustomer: jest.fn(async () => ({ customer: { id: 'customer' } })),
    addPet: jest.fn(async () => ({ id: 'pet' })),
    addAddress: jest.fn(async () => ({ id: 'address' }))
  };
  const pickup = { quote: jest.fn(async () => ({ allowed: false })) };
  const sessionService = {
    authenticate: jest.fn(async req => {
      const role = roles[req.get('x-test-role')];
      return role ? { userId: STAFF, state: 'ACTIVE', roles: role,
        sessionId: 'test-session', expiresAt: now + 300000 } : null;
    }),
    verifyCsrf: jest.fn(async (_actor, token) => token === 'valid-csrf')
  };
  const module = counterBookingRuntimeModule({
    config: { auth: { enabled: true } }, connection: { db: {} },
    env: { COUNTER_BOOKING_ENABLED: enabled ? 'true' : 'false' },
    sessionService, services: { directory, pickup }, clock: () => now
  });
  const app = express(); app.use(express.json());
  if (module) app.use(module.mount, module.router);
  app.use(errorHandler(() => {}));
  const get = (role, path) => request(app).get('/api/v1/counter-bookings' + path).set('x-test-role', role);
  const post = (role, path, csrf = true) => {
    let req = request(app).post('/api/v1/counter-bookings' + path)
      .set('x-test-role', role).set('host', '127.0.0.1').set('origin', 'http://127.0.0.1');
    if (csrf) req = req.set('x-csrf-token', 'valid-csrf');
    return req;
  };
  return { module, directory, pickup, get, post };
}

test('counter booking router stays opt-in while backend settlement is incomplete', () => {
  expect(fixture(false).module).toBeNull();
  expect(fixture(true).module.mount).toBe('/api/v1/counter-bookings');
});
test.each(['customer', 'employee', 'sitter'])('%s cannot use any counter booking commands', async role => {
  const f = fixture();
  await f.get(role, '/services').expect(403);
  await f.post(role, '/customer-lookups').send({ phone: '0912345678' }).expect(403);
  expect(f.directory.lookup).not.toHaveBeenCalled();
});
test.each(['staff', 'admin'])('%s may search, create a customer and pet with CSRF', async role => {
  const f = fixture();
  await f.get(role, '/services').expect(200);
  await f.post(role, '/customer-lookups').send({ phone: '0912345678' }).expect(200);
  await f.post(role, '/customers').send({ displayName: 'Synthetic customer', phone: '0912345678' }).expect(201);
  await f.post(role, '/customers/customer-id/pets').set('idempotency-key', 'create-pet-001')
    .send({ name: 'Synthetic pet' }).expect(201);
  expect(f.directory.lookup).toHaveBeenCalled();
  expect(f.directory.addPet).toHaveBeenCalledWith(expect.objectContaining({ roles: roles[role] }),
    'customer-id', { name: 'Synthetic pet' }, 'create-pet-001');
});
test('state changing counter operations require CSRF and a valid session', async () => {
  const f = fixture();
  await f.post('staff', '/customers', false).send({ phone: '0912345678' }).expect(403);
  await f.get('invalid', '/services').expect(401);
  expect(f.directory.createCustomer).not.toHaveBeenCalled();
});
test('incomplete checkout cannot capture funds or write partial orders', async () => {
  const f = fixture();
  const preview = await f.post('staff', '/previews').send({ amountVnd: 1 }).expect(503);
  const checkout = await f.post('staff', '/').set('idempotency-key', 'cash-12345678')
    .send({ paymentMethod: 'COUNTER_CASH', amountVnd: 1 }).expect(503);
  await f.get('staff', '/slots?date=2026-11-28').expect(503);
  expect(preview.body.error?.code ?? preview.body.code).toBe('COUNTER_CHECKOUT_UNAVAILABLE');
  expect(checkout.body.error?.code ?? checkout.body.code).toBe('COUNTER_CHECKOUT_UNAVAILABLE');
});
