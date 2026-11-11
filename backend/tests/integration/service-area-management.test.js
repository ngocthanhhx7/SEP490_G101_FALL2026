import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { provisionServiceAreaStorage, seedServiceAreas } from '../../src/services/service-area-provisioning.service.js';
import { createServiceAreaManagement } from '../../src/services/service-area-management.service.js';
import { createServiceAreaCatalog } from '../../src/services/service-area-catalog.service.js';
import { createSitterWorkAreasService } from '../../src/services/sitter-work-areas.service.js';
import { DEMO_WORK_AREAS } from '../../src/constants/demo-work-areas.js';
import express from 'express';
import request from 'supertest';
import { serviceAreaRuntimeModule } from '../../src/routes/service-area.routes.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { serviceAreaModels } from '../../src/models/service-area.model.js';
let replica, connection, service, dataset;
const admin = { userId: String(new mongoose.Types.ObjectId()), roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0 };
const sitter = { userId: String(new mongoose.Types.ObjectId()), roles: ['PET_SITTER'], state: 'ACTIVE' };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'areas', autoCreate: false, autoIndex: false }).asPromise();
  await connection.db.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(admin.userId), roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0 });
  dataset = JSON.parse(await readFile(new URL('../../data/vn-administrative-units-2025.json', import.meta.url), 'utf8'));
  await provisionServiceAreaStorage(connection);
  service = createServiceAreaManagement({ connection });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('complete hierarchy seeds idempotently with new areas disabled and legacy selections unchanged', async () => {
  const dry = await seedServiceAreas(connection, dataset); expect(dry.state).toBe('DRY_RUN');
  expect(await connection.db.collection('serviceareas').countDocuments()).toBe(0);
  expect((await seedServiceAreas(connection, dataset, { apply: true })).inserted).toBe(3377);
  expect((await seedServiceAreas(connection, dataset, { apply: true })).inserted).toBe(0);
  const rows = await connection.db.collection('serviceareas').aggregate([{ $group: { _id: '$level', count: { $sum: 1 } } }]).toArray();
  expect(rows.find(row => row._id === 'PROVINCE').count).toBe(34); expect(rows.find(row => row._id === 'COMMUNE').count).toBe(3321);
  const catalog = createServiceAreaCatalog(connection);
  expect((await catalog.list()).map(row => row.code).sort()).toEqual(DEMO_WORK_AREAS.map(row => row.code).sort());
  const workAreas = createSitterWorkAreasService({ listCoverageAreas: () => catalog.list({ all: true }),
    getSitterAvailability: async () => ({ version: 7, areas: DEMO_WORK_AREAS.map(row => row.code) }), replaceSitterAreas: async () => null });
  const mine = await workAreas.getMine({ actor: sitter }); expect(mine.selectedCodes).toHaveLength(22); expect(mine.expectedVersion).toBe(7);
});

test('admin activation, stale version, replay and closure govern sitter registration without deleting old choices', async () => {
  const page = await service.list(admin, { parentCode: 'PROVINCE_01' }); expect(page.items).toHaveLength(100); expect(page.nextCursor).toBeTruthy();
  const next = await service.list(admin, { parentCode: 'PROVINCE_01', after: page.nextCursor });
  expect(new Set([...page.items, ...next.items].map(row => row.code)).size).toBe(page.items.length + next.items.length);
  const code = page.items[0].code, catalog = createServiceAreaCatalog(connection);
  await expect(catalog.assertOpen(code)).rejects.toMatchObject({ code: 'WORK_AREA_CLOSED' });
  await expect(service.change(sitter, { codes: [code], enabled: true, expectedVersion: 0, reason: 'Đã khảo sát khu vực' }, 'service-area-001')).rejects.toMatchObject({ status: 403 });
  const body = { codes: [code], enabled: true, expectedVersion: page.expectedVersion, reason: 'Đã khảo sát khu vực' };
  const result = await service.change(admin, body, 'service-area-001');
  expect(await service.change(admin, body, 'service-area-001')).toEqual(result);
  await expect(service.change(admin, { ...body, enabled: false }, 'service-area-001')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(service.change(admin, body, 'service-area-002')).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  await catalog.assertOpen(code);
  await service.change(admin, { ...body, enabled: false, expectedVersion: result.expectedVersion }, 'service-area-003');
  await expect(catalog.assertOpen(code)).rejects.toMatchObject({ code: 'WORK_AREA_CLOSED' });
  let stored = { areas: [code], version: 1 };
  const workAreas = createSitterWorkAreasService({ listCoverageAreas: () => catalog.list({ all: true }), getSitterAvailability: async () => stored,
    replaceSitterAreas: async ({ areas }) => (stored = { areas, version: stored.version + 1 }) });
  expect((await workAreas.getMine({ actor: sitter })).options.find(row => row.code === code).enabled).toBe(false);
  await workAreas.replaceMine({ actor: sitter, areas: [], expectedVersion: 1, idempotencyKey: 'remove-old-001' });
  await expect(workAreas.replaceMine({ actor: sitter, areas: [code], expectedVersion: 2, idempotencyKey: 'add-closed-001' })).rejects.toMatchObject({ status: 422 });
  // Provisioning replay cannot reopen areas disabled by the admin.
  await seedServiceAreas(connection, dataset, { apply: true }); await expect(catalog.assertOpen(code)).rejects.toMatchObject({ code: 'WORK_AREA_CLOSED' });
});

test('parent listing uses its compound index and bounded page', async () => {
  const explain = await connection.db.collection('serviceareas').find({ level: 'COMMUNE', parentCode: 'PROVINCE_01' }).sort({ _id: 1 }).limit(101).explain('executionStats');
  expect(explain.executionStats.nReturned).toBe(101); expect(explain.executionStats.totalDocsExamined).toBeLessThanOrEqual(101);
  expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain('service_area_parent');
  expect(JSON.stringify(explain.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
});

test('HTTP registry requires active Admin and CSRF; Staff and sitter cannot configure coverage', async () => {
  const sessionService = { authenticate: async req => req.get('x-test-role') ? { ...admin, roles: [req.get('x-test-role')], expiresAt: Date.now() + 60000 } : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const module = serviceAreaRuntimeModule({ config: { auth: { enabled: true } }, connection, env: { EMPLOYEE_SCHEDULING_ENABLED: 'true' }, sessionService });
  const app = express(); app.use(express.json(), requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
  await request(app).get(module.mount + '?level=PROVINCE').expect(401);
  for (const role of ['CUSTOMER', 'PET_SITTER', 'STAFF']) await request(app).get(module.mount + '?level=PROVINCE').set('x-test-role', role).expect(403);
  const result = await request(app).get(module.mount + '?level=PROVINCE').set('x-test-role', 'ADMIN').expect(200);
  expect(result.body.data.items).toHaveLength(34); expect(result.headers['cache-control']).toBe('private, no-store');
  await request(app).put(module.mount).set('x-test-role', 'ADMIN').send({}).expect(403);
  await request(app).put(module.mount).set('x-test-role', 'ADMIN').set('x-csrf-token', 'synthetic-csrf').set('host', 'paw.test').set('origin', 'http://paw.test').send({}).expect(422);
});

test('closure and new work serialize on the shared policy gate', async () => {
  const catalog = createServiceAreaCatalog(connection), { ServiceArea: Area } = serviceAreaModels(connection);
  const code = 'COMMUNE_00004'; await Area.updateOne({ _id: code }, { $set: { enabled: true } });
  let announce, release;
  const locked = new Promise(resolve => { announce = resolve; }), resume = new Promise(resolve => { release = resolve; });
  const close = connection.transaction(async session => {
    await Area.updateOne({ _id: 'coverage-policy' }, { $inc: { version: 1 } }, { session });
    await Area.updateOne({ _id: code }, { $set: { enabled: false } }, { session });
    announce(); await resume;
  });
  await locked;
  const pending = connection.transaction(async session => {
    await catalog.assertOpen(code, session);
    await connection.db.collection('synthetic_new_work').insertOne({ areaCode: code }, { session });
  }).then(() => ({ accepted: true }), error => ({ code: error.code }));
  release(); await close;
  expect(await pending).toMatchObject({ code: 'WORK_AREA_CLOSED' });
  expect(await connection.db.collection('synthetic_new_work').countDocuments()).toBe(0);
});
