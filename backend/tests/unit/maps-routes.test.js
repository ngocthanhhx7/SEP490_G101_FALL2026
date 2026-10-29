import { test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { mapsRuntimeModule } from '../../src/routes/maps.routes.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';

test('maps search requires active session and CSRF, has private responses and a per-account provider budget', async () => {
  const service = { search: jest.fn(async () => ({ provider: 'GOONG', items: [] })) };
  const sessionService = {
    authenticate: async req => req.get('x-test-actor') ? { userId: req.get('x-test-actor'), roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: Date.now() + 60000 } : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
  };
  const module = mapsRuntimeModule({ config: { auth: { enabled: true } }, env: { MAPS_ENABLED: 'true' }, sessionService, service });
  const app = express(); app.use(express.json(), requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
  const path = '/api/v1/maps/search';
  const post = () => request(app).post(path).set('Host', 'localhost').set('Origin', 'http://localhost');
  await post().send({ query: 'Hanoi' }).expect(401);
  await post().set('x-test-actor', 'customer-a').send({ query: 'Hanoi' }).expect(403);
  expect(service.search).not.toHaveBeenCalled();
  for (let index = 0; index < 10; index++) await post().set('x-test-actor', 'customer-a').set('x-csrf-token', 'synthetic-csrf')
    .send({ query: 'Hanoi' }).expect(200).expect('Cache-Control', 'private, no-store');
  await post().set('x-test-actor', 'customer-a').set('x-csrf-token', 'synthetic-csrf').send({ query: 'Hanoi' }).expect(429);
  await post().set('x-test-actor', 'customer-b').set('x-csrf-token', 'synthetic-csrf').send({ query: 'Hanoi' }).expect(200);
  expect(service.search).toHaveBeenCalledTimes(11);
});

test('maps is opt-in and does not mount without authentication', () => {
  expect(mapsRuntimeModule({ config: {}, env: { MAPS_ENABLED: 'true' } })).toBeNull();
  expect(mapsRuntimeModule({ config: { auth: { enabled: true } } })).toBeNull();
});
