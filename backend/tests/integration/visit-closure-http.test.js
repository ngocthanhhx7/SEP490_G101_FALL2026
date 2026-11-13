import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { employeeSchedulingRuntimeModule } from '../../src/routes/employee-scheduling.routes.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';

const oid = () => new mongoose.Types.ObjectId();
const END = Date.parse('2026-11-04T06:30:00Z');
const clock = () => END + 2 * 3600000 + 10 * 60000;
const person = role => ({ _id: oid(), state: 'ACTIVE', roles: [role], displayName: role, authEpoch: 0 });
const users = { staff: person('STAFF'), admin: person('ADMIN'), customer: person('CUSTOMER'), sitter: person('PET_SITTER') };
let replica, connection, app, mount, counter = 0;
const col = name => connection.db.collection(name);

async function seedVisit() {
  const visitId = oid(), bookingId = oid(), mediaId = (++counter).toString(16).padStart(64, 'b');
  await col('bookings').insertOne({ _id: bookingId, customerId: users.customer._id, state: 'IN_PROGRESS', bookingCode: 'BK-0033', visitIds: [visitId] });
  await col('visits').insertOne({ _id: visitId, bookingId, customerId: users.customer._id, sitterId: users.sitter._id, state: 'IN_PROGRESS', version: 4,
    areaCode: 'DISTRICT_CAU_GIAY', startAt: new Date(END - 30 * 60000), endAt: new Date(END), checkInAt: new Date(END - 28 * 60000),
    evidenceRefs: [{ kind: 'CHECK_IN', mediaId }], snapshots: { serviceName: 'Dắt chó đi dạo' } });
  await col('privateimages').insertOne({ _id: mediaId, state: 'READY', careKind: 'CHECK_IN', ownerId: users.sitter._id, careVisitId: String(visitId) });
  return String(visitId);
}
const call = (method, path, who, { key, csrf = true, body } = {}) => {
  let req = request(app)[method](`${mount}${path}`).set('Host', 'localhost').set('Origin', 'http://localhost');
  if (who) req = req.set('x-test-actor', String(users[who]._id));
  if (csrf) req = req.set('x-csrf-token', 'synthetic-csrf');
  if (key) req = req.set('Idempotency-Key', key);
  return body === undefined ? req : req.send(body);
};

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_visit_closure_http' }).asPromise();
  await provisionEmployeeScheduling(connection);
  await col('users').insertMany(Object.values(users));
  const sessionService = { authenticate: async req => {
    const id = req.get('x-test-actor');
    const record = id && await col('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
    return record ? { ...record, userId: id, expiresAt: clock() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const module = employeeSchedulingRuntimeModule({ connection, config: { auth: { enabled: true } }, clock, sessionService,
    env: { EMPLOYEE_SCHEDULING_ENABLED: 'true' } });
  mount = module.mount;
  app = express(); app.use(express.json(), requestId); app.use(mount, module.router); app.use(errorHandler(() => {}));
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('close visit routes (UC-33, GBR-24)', () => {
  test.each(['staff', 'admin'])('%s lists, reads and closes a visit not checked out', async who => {
    const visitId = await seedVisit();
    const list = await call('get', '/closable-visits', who).expect(200);
    expect(list.body.data.items.find(item => item.id === visitId)).toMatchObject({ bookingCode: 'BK-0033', hasCheckInPhoto: true, version: 4 });
    expect((await call('get', `/visits/${visitId}/closure`, who).expect(200)).body.data).toMatchObject({ id: visitId, sitterName: 'PET_SITTER' });
    const closed = await call('post', `/visits/${visitId}/closures`, who, { key: `http-close-${who}-key`, body: { expectedVersion: 4, reason: 'Đã gọi xác nhận.' } }).expect(200);
    expect(closed.body.data).toMatchObject({ visitId, state: 'STAFF_CLOSED', version: 5, hasCheckInPhoto: true });
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).closure.byUserId).toBe(String(users[who]._id));
  });

  test('a request without a CSRF token is refused and the visit is unchanged', async () => {
    const visitId = await seedVisit();
    await call('post', `/visits/${visitId}/closures`, 'staff', { key: 'http-close-no-csrf', csrf: false, body: { expectedVersion: 4, reason: 'Thiếu CSRF' } }).expect(403);
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).state).toBe('IN_PROGRESS');
  });

  test('requests without a session are 401', async () => {
    const visitId = await seedVisit();
    await call('get', '/closable-visits', null).expect(401);
    await call('get', `/visits/${visitId}/closure`, null).expect(401);
    await call('post', `/visits/${visitId}/closures`, null, { key: 'http-close-anonymous', body: { expectedVersion: 4, reason: 'Chưa đăng nhập' } }).expect(401);
  });

  test.each(['customer', 'sitter'])('a %s gets 403 on every close route', async who => {
    const visitId = await seedVisit();
    await call('get', '/closable-visits', who).expect(403);
    await call('get', `/visits/${visitId}/closure`, who).expect(403);
    await call('post', `/visits/${visitId}/closures`, who, { key: `http-close-${who}-role`, body: { expectedVersion: 4, reason: 'Sai vai trò' } }).expect(403);
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).state).toBe('IN_PROGRESS');
  });

  test('maps validation, state and key errors to 422 and 409 with the standard error body', async () => {
    const visitId = await seedVisit();
    const missing = await call('post', `/visits/${visitId}/closures`, 'staff', { key: 'http-close-missing-reason', body: { expectedVersion: 4, reason: ' ' } }).expect(422);
    expect(missing.body.error?.code ?? missing.body.code).toBe('VALIDATION_FAILED');
    await call('post', `/visits/${visitId}/closures`, 'staff', { body: { expectedVersion: 4, reason: 'Thiếu key' } }).expect(422);
    await call('post', `/visits/${visitId}/closures`, 'staff', { key: 'http-close-stale-version', body: { expectedVersion: 1, reason: 'Cũ' } }).expect(409);
    const body = { expectedVersion: 4, reason: 'Đóng một lần' };
    await call('post', `/visits/${visitId}/closures`, 'staff', { key: 'http-close-once-key', body }).expect(200);
    const replay = await call('post', `/visits/${visitId}/closures`, 'staff', { key: 'http-close-once-key', body }).expect(200);
    expect(replay.body.data.version).toBe(5);
    await call('post', `/visits/${visitId}/closures`, 'admin', { key: 'http-close-already-closed', body: { expectedVersion: 5, reason: 'Đóng lại' } }).expect(409);
  });
});
