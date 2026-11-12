import { beforeAll, afterAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createWorkspaceAnalytics } from '../../src/services/dashboards/workspace-analytics.service.js';

let server, connection;
const now = new Date('2026-11-08T05:00:00Z'), actor = { userId: '507f1f77bcf86cd799439011', roles: ['ADMIN'], state: 'ACTIVE', expiresAt: Date.now() + 3600000 };
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(server.getUri(), { dbName: 'bounded_service_analytics', autoCreate: false, autoIndex: false }).asPromise();
  for (const name of ['services', 'serviceversions', 'servicepriceversions', 'visits']) await connection.db.createCollection(name);
  await connection.db.collection('serviceversions').createIndex({ serviceId: 1, effectiveAt: 1 }, { unique: true });
}, 600000);
afterAll(async () => { await connection?.close(); await server?.stop(); }, 30000);
test('latest state includes inactive history, excludes future/orphan rows and preserves analytics windows', async () => {
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  await connection.db.collection('services').insertMany(ids.map(_id => ({ _id })));
  const row = (serviceId, effectiveAt, state, version) => ({ serviceId, effectiveAt: new Date(effectiveAt), state, version });
  await connection.db.collection('serviceversions').insertMany([
    row(ids[0], '2026-01-01', 'ACTIVE', 1), row(ids[0], '2026-02-01', 'INACTIVE', 2), row(ids[0], '2026-12-01', 'ACTIVE', 3),
    row(ids[1], '2026-01-01', 'ACTIVE', 1), row(ids[2], '2026-12-01', 'ACTIVE', 1),
    row(new mongoose.Types.ObjectId(), '2026-01-01', 'ACTIVE', 1)
  ]);
  await connection.db.collection('servicepriceversions').insertMany([
    { serviceId: ids[0], effectiveAt: new Date('2026-01-01') },
    { serviceId: ids[1], effectiveAt: new Date('2026-12-01') }
  ]);
  const analytics = createWorkspaceAnalytics({ connection, clock: () => now.getTime() });
  for (const days of [7, 30, 90]) {
    const result = await analytics.read({ actor, kind: 'services', query: { days } });
    expect(result.metrics.map(metric => metric.value)).toEqual([2, 1, 1, 0]);
    expect(result.trend).toHaveLength(days); expect(result.asOf).toBe(now.toISOString());
  }
  await expect(analytics.read({ actor: { ...actor, roles: ['CUSTOMER'] }, kind: 'services' })).rejects.toMatchObject({ status: 403 });
});
test('catalog over budget fails instead of returning truncated metrics', async () => {
  await connection.db.collection('services').insertMany(Array.from({ length: 1000 }, () => ({})));
  await expect(createWorkspaceAnalytics({ connection }).read({ actor, kind: 'services' })).rejects.toMatchObject({ code: 'ANALYTICS_SOURCE_LIMIT' });
});
