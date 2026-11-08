import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { servicePriceModule } from '../../src/routes/service-price.routes.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { parsePriceHistoryQuery } from '../../src/validators/service-price-history.validator.js';
import { createServicePriceService } from '../../src/services/service-price.service.js';

const serviceId = '507f1f77bcf86cd799439010';
let replica, connection, app, Model, service;
const url = `/api/v1/service-prices/admin/${serviceId}/history`;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_price_history', monitorCommands: true }).asPromise();
  const module = servicePriceModule({ connection, config: { auth: { enabled: true } }, serviceExists: async id => id === serviceId,
    sessionService: { authenticate: async req => req.get('x-role') ? { userId: '507f1f77bcf86cd799439011', state: 'ACTIVE',
      roles: [req.get('x-role')], expiresAt: Date.now() + 60000 } : null, verifyCsrf: async () => false } });
  app = express(); app.use(requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
  Model = connection.models.ServicePriceVersion; await Model.init(); service = module.prices;
  await Model.collection.insertMany(Array.from({ length: 123 }, (_, index) => ({ serviceId: new mongoose.Types.ObjectId(serviceId),
    version: index + 1, amountVnd: 1000 + index, currency: 'VND', unitLabel: 'hour',
    effectiveAt: new Date(Date.UTC(2020 + index, 0, 1)), changedBy: new mongoose.Types.ObjectId(), reason: 'Synthetic history' })));
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('history retains auth/privacy and exact DTO while the legacy endpoint remains available', async () => {
  await request(app).get(url).expect(401);
  await request(app).get(url).set('x-role', 'CUSTOMER').expect(403);
  const result = await request(app).get(url).set('x-role', 'STAFF').expect(200).expect('Cache-Control', 'private, no-store');
  expect(result.body.data.prices).toHaveLength(20); expect(result.body.data.latestVersion).toBe(123);
  expect(result.body.data.prices[0].effectiveAt).toBe('2142-01-01T00:00:00.000Z');
  expect(Object.keys(result.body.data.prices[0]).sort()).toEqual(['serviceId', 'version', 'amountVnd', 'currency', 'unitLabel', 'effectiveAt'].sort());
  const old = await request(app).get(url.replace('/history', '')).set('x-role', 'ADMIN').expect(200);
  expect(old.body.data.prices).toHaveLength(123); expect(old.body.data.latestVersion).toBe(123);
});
test('all pages equal legacy history with no duplicates; owner/effective unique index bounds deep page', async () => {
  const all = [], commands = [];
  let before;
  do {
    const page = await service.listHistory(serviceId, { limit: '50', ...(before ? { before } : {}) });
    all.push(...page.prices); before = page.nextCursor;
  } while (before);
  expect(all).toEqual(await service.list(serviceId));
  const first = await service.listHistory(serviceId, { limit: '50' });
  const listener = e => { if (e.commandName === 'find') commands.push(e.command); };
  connection.getClient().on('commandStarted', listener);
  try { await service.listHistory(serviceId, { limit: '50', before: first.nextCursor }); }
  finally { connection.getClient().off('commandStarted', listener); }
  const pageQuery = commands.find(command => command.filter.effectiveAt);
  expect(pageQuery.limit).toBe(51); expect(pageQuery.maxTimeMS).toBe(5000);
  const explain = await connection.db.command({ explain: { find: Model.collection.name, filter: pageQuery.filter,
    sort: pageQuery.sort, projection: pageQuery.projection, limit: 51 }, verbosity: 'executionStats' });
  expect(explain.executionStats.totalDocsExamined).toBeLessThanOrEqual(51);
  expect(explain.executionStats.totalKeysExamined).toBeLessThanOrEqual(51);
});
test.each([{ limit: '0' }, { limit: '51' }, { limit: ['20'] }, { page: '2' }, { before: 'bad' },
  { before: '507f1f77bcf86cd799439099~2020-01-01T00:00:00.000Z' },
  { before: `${serviceId}~2020-02-31T00:00:00.000Z` }])('strict query validation rejects %j', async query => {
  expect(() => parsePriceHistoryQuery(query, serviceId)).toThrow();
});
test('missing/malformed parents and HTTP query failures preserve status contracts', async () => {
  await request(app).get(url + '?limit=51').set('x-role', 'ADMIN').expect(422);
  await request(app).get(url.replace(serviceId, '507f1f77bcf86cd799439099')).set('x-role', 'ADMIN').expect(404);
  await request(app).get(url.replace(serviceId, 'bad')).set('x-role', 'ADMIN').expect(404);
});
test('latestVersion is independent of effective-time cursor and concurrent backdated insert remains accessible', async () => {
  const first = await service.listHistory(serviceId, { limit: '50' });
  await Model.collection.insertOne({ serviceId: new mongoose.Types.ObjectId(serviceId), version: 124,
    amountVnd: 100, currency: 'VND', unitLabel: 'hour', effectiveAt: new Date('2000-01-01') });
  const next = await service.listHistory(serviceId, { before: first.nextCursor, limit: '50' });
  expect(next.latestVersion).toBe(124); expect(next.prices.some(row => row.version === 124)).toBe(false);
  const last = await service.listHistory(serviceId, { before: next.nextCursor, limit: '50' });
  expect(last.prices.at(-1).version).toBe(124); expect(last.nextCursor).toBeNull();
});
test('query timeout maps to a safe 503 only on the additive reader', async () => {
  const failing = { find: () => { const q = { sort: () => q, limit: () => q, select: () => q,
    maxTimeMS: () => q, lean: () => Promise.reject(Object.assign(new Error('private driver diagnostic'), { code: 50 })) }; return q; },
  findOne: () => { const q = { sort: () => q, select: () => q, maxTimeMS: () => q, lean: async () => null }; return q; } };
  const reader = createServicePriceService({ connection, PriceVersion: failing, serviceExists: async () => true });
  await expect(reader.listHistory(serviceId, {})).rejects.toMatchObject({ status: 503, code: 'PRICE_HISTORY_UNAVAILABLE' });
});
