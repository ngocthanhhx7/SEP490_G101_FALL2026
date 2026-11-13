import { beforeAll, afterAll, describe, test, expect, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { employeeSchedulingRuntimeModule } from '../../src/routes/employee-scheduling.routes.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';

const oid = () => new mongoose.Types.ObjectId();
const NOW = Date.parse('2026-11-04T01:40:00Z');
const clock = () => NOW;
const person = (role, displayName) => ({ _id: oid(), state: 'ACTIVE', roles: [role], displayName, authEpoch: 0 });
const users = { staff: person('STAFF', 'Đặng Thu Trang'), admin: person('ADMIN', 'Quản trị'), customer: person('CUSTOMER', 'Ngô Minh Đức'),
  sitter: person('PET_SITTER', 'Trịnh Văn Hoà'), noPhone: person('PET_SITTER', 'Không Số') };
const SITTER_PHONE = '0912345678', CUSTOMER_PHONE = '0987654321';
const auth = { enabled: true, tokenSecret: 'visit-board-token-secret-32-bytes!!', contactLookupSecret: 'visit-board-lookup-secret-32-bytes!', contactEncryptionKey: '0123456789abcdef0123456789abcdef' };
let replica, connection, app, bare, mount;
const col = name => connection.db.collection(name);
const log = jest.fn();

async function addPhone(user, local) {
  const crypto = createContactCrypto({ lookupSecret: auth.contactLookupSecret, encryptionKey: auth.contactEncryptionKey });
  const { canonicalValue, lookupKey } = crypto.lookup('PHONE', `+84${local.slice(1)}`);
  await col('contacts').insertOne({ userId: user._id, channel: 'PHONE', canonicalCiphertext: crypto.encrypt(canonicalValue), lookupKey, state: 'VERIFIED', verifiedAt: new Date(NOW) });
}
async function seedVisit({ sitter = users.sitter } = {}) {
  const visitId = oid(), bookingId = oid();
  await col('bookings').insertOne({ _id: bookingId, customerId: users.customer._id, state: 'ASSIGNED', carePlanState: 'APPROVED', paymentMode: 'POSTPAY', visitIds: [visitId] });
  await col('visits').insertOne({ _id: visitId, bookingId, customerId: users.customer._id, sitterId: sitter?._id ?? null, state: sitter ? 'ASSIGNED' : 'SCHEDULED', version: 1,
    areaCode: 'DISTRICT_CAU_GIAY', startAt: new Date(NOW - 40 * 60000), endAt: new Date(NOW - 10 * 60000), snapshots: { serviceName: 'Chăm sóc tại nhà' } });
  return String(visitId);
}
const call = (target, method, path, who, { csrf = true } = {}) => {
  let req = request(target)[method](`${mount}${path}`).set('Host', 'localhost').set('Origin', 'http://localhost');
  if (who) req = req.set('x-test-actor', String(users[who]._id));
  if (csrf) req = req.set('x-csrf-token', 'synthetic-csrf');
  return req;
};
function build(config) {
  const sessionService = { authenticate: async req => {
    const id = req.get('x-test-actor');
    const record = id && await col('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
    return record ? { ...record, userId: id, expiresAt: clock() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const module = employeeSchedulingRuntimeModule({ connection, config, clock, sessionService, env: { EMPLOYEE_SCHEDULING_ENABLED: 'true' } });
  mount = module.mount;
  const target = express(); target.use(express.json(), requestId); target.use(mount, module.router); target.use(errorHandler(log));
  return target;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_needs_action_http' }).asPromise();
  await provisionEmployeeScheduling(connection);
  await col('users').insertMany(Object.values(users));
  await addPhone(users.sitter, SITTER_PHONE); await addPhone(users.customer, CUSTOMER_PHONE);
  app = build({ auth });
  bare = build({ auth: { enabled: true } });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('visit board routes', () => {
  test.each(['staff', 'admin'])('%s reads both lists, and the lists never contain a phone number', async who => {
    await seedVisit();
    const needs = await call(app, 'get', '/visit-board', who).expect(200);
    expect(needs.body.data).toMatchObject({ tab: 'needs-action', counts: { needsAction: expect.any(Number) } });
    expect(needs.body.data.items.find(item => item.sitterName === 'Trịnh Văn Hoà').reasons[0]).toMatchObject({ code: 'NOT_CHECKED_IN_30M', late: true });
    const all = await call(app, 'get', '/visit-board?tab=all', who).expect(200);
    expect(all.body.data.tab).toBe('all');
    for (const body of [needs.text, all.text]) expect(body).not.toMatch(new RegExp(`${SITTER_PHONE}|${CUSTOMER_PHONE}|84912345678|phone`, 'iu'));
  });

  test('requests without a session are 401 and other roles are 403', async () => {
    const visitId = await seedVisit();
    for (const path of ['/visit-board', `/visits/${visitId}/contact?party=sitter`]) {
      await call(app, 'get', path, null).expect(401);
      for (const who of ['customer', 'sitter']) await call(app, 'get', path, who).expect(403);
    }
  });

  test('a bad query is 422 with the standard error body', async () => {
    const response = await call(app, 'get', '/visit-board?reason=DEBT', 'staff').expect(422);
    expect(response.body.error?.code ?? response.body.code).toBe('VALIDATION_FAILED');
    await call(app, 'get', '/visit-board?tab=all&search=a', 'staff').expect(422);
  });
});

describe('Call: phone number of one visit', () => {
  test.each([['staff', 'sitter', SITTER_PHONE, 'Trịnh Văn Hoà'], ['admin', 'customer', CUSTOMER_PHONE, 'Ngô Minh Đức']])(
    '%s gets the %s phone number only for this request, and the audit event has no number', async (who, party, phone, name) => {
      const visitId = await seedVisit();
      const spies = ['log', 'info', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
      log.mockClear();
      const response = await call(app, 'get', `/visits/${visitId}/contact?party=${party}`, who).expect(200);
      const printed = JSON.stringify([...spies.flatMap(spy => spy.mock.calls), ...log.mock.calls]);
      spies.forEach(spy => spy.mockRestore());
      expect(response.body.data).toEqual({ party, displayName: name, phone });
      expect(response.headers['cache-control']).toMatch(/no-store/u);
      expect(printed).not.toContain(phone.slice(1));
      const event = await col('employeescheduleevents').findOne({ type: 'VisitContactViewed', visitId });
      expect(event).toMatchObject({ actorId: String(users[who]._id), detail: { party, found: true } });
      expect(JSON.stringify(event)).not.toContain(phone.slice(1));
    });

  test('a pet sitter without a verified phone number gets phone null and the lookup is recorded as not found', async () => {
    const visitId = await seedVisit({ sitter: users.noPhone });
    const response = await call(app, 'get', `/visits/${visitId}/contact?party=sitter`, 'staff').expect(200);
    expect(response.body.data).toEqual({ party: 'sitter', displayName: 'Không Số', phone: null });
    expect(await col('employeescheduleevents').findOne({ type: 'VisitContactViewed', visitId })).toMatchObject({ detail: { party: 'sitter', found: false } });
  });

  test('a visit without a pet sitter has no sitter phone (404) but its customer can still be called; an unknown visit is 404', async () => {
    const visitId = await seedVisit({ sitter: null });
    await call(app, 'get', `/visits/${visitId}/contact?party=sitter`, 'staff').expect(404);
    expect((await call(app, 'get', `/visits/${visitId}/contact?party=customer`, 'staff').expect(200)).body.data.phone).toBe(CUSTOMER_PHONE);
    await call(app, 'get', `/visits/${oid()}/contact?party=sitter`, 'staff').expect(404);
  });

  test.each(['', '?party=owner', '?party=sitter&extra=1', '?party=sitter&party=customer'])('the query "%s" is 422', async query => {
    const visitId = await seedVisit();
    await call(app, 'get', `/visits/${visitId}/contact${query}`, 'staff').expect(422);
  });

  test('without the contact keys configured the module still starts and Call answers 503', async () => {
    const visitId = await seedVisit();
    const response = await call(bare, 'get', `/visits/${visitId}/contact?party=sitter`, 'staff').expect(503);
    expect(response.body.error?.code ?? response.body.code).toBe('CONTACT_LOOKUP_UNAVAILABLE');
    await call(bare, 'get', '/visit-board', 'staff').expect(200);
    await call(bare, 'get', '/visit-board?tab=all', 'staff').expect(200);
  });

  test('Call is limited to 30 requests a minute for each user', async () => {
    const visitId = await seedVisit();
    const statuses = [];
    for (let index = 0; index < 32; index++) statuses.push((await call(app, 'get', `/visits/${visitId}/contact?party=customer`, 'admin')).status);
    expect(statuses.filter(status => status === 429).length).toBeGreaterThan(0);
    expect(statuses[0]).toBe(200);
  });
});
