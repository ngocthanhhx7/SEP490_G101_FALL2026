import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { userModel } from '../../src/models/user.model.js';

let replica, connection, app, admin, staff, customer, employee;
const col = name => connection.db.collection(name);
const headers = s => ({ Host: '127.0.0.1', Origin: 'http://127.0.0.1', Cookie: `pwc_session=${s.token}`, 'X-CSRF-Token': s.csrfToken });
const root = '/api/v1/sitter-management';
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true', SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48),
    OTP_HMAC_SECRET: 'c'.repeat(48), CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32), MONGO_URI: replica.getUri(), MONGO_DB: 'sitter_management_test' };
  const config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  app = createApp({ config, connection, env, lifecycle: { draining: false } });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  const sessions = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const create = async role => {
    const user = await userModel(connection).create({ displayName: 'Synthetic ' + role, roles: [role], state: 'ACTIVE' });
    return connection.transaction(session => sessions.issueInTransaction(user, session));
  };
  admin = await create('ADMIN'); staff = await create('STAFF'); customer = await create('CUSTOMER'); employee = await create('PET_SITTER');
  const now = new Date(), target = new mongoose.Types.ObjectId(employee.user.id);
  await col('sitterstatuses').insertOne({ userId: target, status: 'ACTIVE', version: 0, changedAt: now });
  await col('sitterapplications').insertOne({ provisionedUserId: target, state: 'APPROVED', experience: 'Synthetic private experience',
    requestedServices: ['home-care'], workAreas: ['DISTRICT_TAY_HO'], privateDocuments: [{ storageRef: 'secret-document' }],
    contactCiphertext: 'private-contact', identityLookupKey: 'private-identity', ageEligible: true, createdAt: now, updatedAt: now });
  await col('aisitterprofiles').insertOne({ userId: target, active: true, species: ['DOG'], areaCodes: ['DISTRICT_TAY_HO'], maxPets: 2, maxWeightKg: 15,
    serviceIds: [], allowedTraits: [], starts: [{ coordinates: [105, 21], privateMarker: 'private-location' }] });
  await col('employmentcontracts').insertOne({ employeeId: target, employmentType: 'PART_TIME', signedAt: new Date(0), effectiveAt: new Date(0),
    weeklyMinutes: 1200, version: 1, monthlyBaseVnd: 3000000, contractReference: 'private-contract', verifiedBy: new mongoose.Types.ObjectId(admin.user.id) });
  await col('employeeavailabilities').insertOne({ _id: employee.user.id, zone: 'Asia/Ho_Chi_Minh', state: 'ACTIVE', version: 1,
    workingWindows: [{ weekday: 2, startLocalTime: '08:00', endLocalTime: '12:00', privateMarker: 'private-window' }], areas: ['DISTRICT_TAY_HO'], dayOffDates: [] });
  await col('users').insertMany(Array.from({ length: 23 }, (_, i) => ({ displayName: 'Demo profile ' + i, roles: ['PET_SITTER'], state: 'ACTIVE',
    fixtureKey: 'coursework-demo:' + i, createdAt: now, synthetic: false })));
  await col('users').insertOne({ displayName: 'Hidden sentinel', roles: ['PET_SITTER'], state: 'ACTIVE', synthetic: true });
  await col('visits').insertMany(Array.from({ length: 23 }, (_, i) => ({ sitterId: i % 2 ? target : employee.user.id,
    startAt: now, endAt: new Date(+now + 3600000), state: i === 0 ? 'ASSIGNED' : 'COMPLETED', snapshots: { serviceName: 'Synthetic service' },
    address: 'private-customer-home', petSnapshots: [{ privateMarker: 'private-pet' }] })));
  await col('visits').insertOne({ sitterId: target, state: 'SUPERSEDED', startAt: now });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('management endpoints protect all data and cache headers; customer directory remains separate', async () => {
  for (const suffix of ['', '/reports', '/' + employee.user.id, '/' + employee.user.id + '/activity']) {
    const anonymous = await request(app).get(root + suffix).expect(401);
    expect(anonymous.headers['cache-control']).toContain('no-store');
    await request(app).get(root + suffix).set(headers(customer)).expect(403);
    await request(app).get(root + suffix).set(headers(employee)).expect(403);
    await request(app).get(root + suffix).set(headers(staff)).expect(200);
  }
  const publicList = await request(app).get('/api/v1/sitters').set(headers(customer)).expect(200);
  expect(JSON.stringify(publicList.body)).not.toContain('private-contact');
});
test('list includes unpublished/unconfigured sitters, scoped cursor pagination and source filtering', async () => {
  const first = (await request(app).get(root + '?limit=20').set(headers(admin)).expect(200)).body.data;
  expect(first.total).toBe(24); expect(first.items).toHaveLength(20); expect(first.nextCursor).toBeTruthy();
  const second = (await request(app).get(root + '?limit=20&cursor=' + first.nextCursor).set(headers(admin)).expect(200)).body.data;
  expect(second.items).toHaveLength(4); expect(new Set([...first.items, ...second.items].map(r => r.id)).size).toBe(24);
  await request(app).get(root + '?limit=20&source=REAL&cursor=' + first.nextCursor).set(headers(admin)).expect(422);
  await request(app).get(root + '?limit=20&cursor=' + first.nextCursor).set(headers(staff)).expect(422);
  expect((await request(app).get(root + '?source=REAL&area=DISTRICT_TAY_HO&employmentType=PART_TIME').set(headers(admin))).body.data.total).toBe(1);
  expect((await request(app).get(root + '?source=DEMO').set(headers(admin))).body.data.total).toBe(23);
  expect((await request(app).get(root + '?search=%5B').set(headers(admin))).body.data.total).toBe(0);
  for (const query of ['limit=0', 'limit=100', 'days=8', 'search[$ne]=', 'status=wrong', 'source=other', 'area[$ne]=', 'unknown=1']) {
    await request(app).get(root + '?' + query).set(headers(admin)).expect(422);
  }
});
test('reports count full filtered population, current contracts, Vietnam period and assigned work only', async () => {
  await col('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(employee.user.id) }, { $set: { areaCodes: ['STALE_AREA'] } });
  const report = (await request(app).get(root + '/reports?days=7').set(headers(staff)).expect(200)).body.data;
  expect(report.counts).toEqual({ total: 24, real: 1, demo: 23, active: 1, suspended: 0, missingContract: 23 });
  expect(report.work).toEqual(expect.arrayContaining([{ state: 'ASSIGNED', count: 1 }, { state: 'COMPLETED', count: 22 }]));
  expect(report.coverage).toEqual([{ code: 'DISTRICT_TAY_HO', count: 1 }]);
  expect((await request(app).get(root + '?area=DISTRICT_TAY_HO').set(headers(staff))).body.data.total).toBe(1);
  const demo = (await request(app).get(root + '/reports?source=DEMO').set(headers(staff))).body.data;
  expect(demo.work).toEqual([]); expect(demo.counts.real).toBe(0);
});
test('detail exposes operational fields while keeping documents, money and private locations behind existing permissions', async () => {
  const staffView = (await request(app).get(root + '/' + employee.user.id).set(headers(staff)).expect(200)).body.data;
  expect(staffView.application.id).toBeUndefined(); expect(staffView.permissions.manageStatus).toBe(false);
  expect(staffView.permissions.manageContract).toBe(false); expect(staffView.contractVersion).toBeUndefined();
  expect(staffView.availability.workingWindows[0]).toEqual({ weekday: 2, startLocalTime: '08:00', endLocalTime: '12:00' });
  const adminView = (await request(app).get(root + '/' + employee.user.id).set(headers(admin)).expect(200)).body.data;
  expect(adminView.permissions.manageStatus).toBe(true); expect(adminView.application.id).toMatch(/^[a-f0-9]{24}$/);
  expect(adminView.permissions.manageContract).toBe(true); expect(adminView.contractVersion).toBe(1);
  for (const text of ['private-contact', 'private-identity', 'secret-document', 'private-contract', 'private-location', 'private-window', 'monthlyBaseVnd', 'authEpoch']) {
    expect(JSON.stringify(adminView)).not.toContain(text); expect(JSON.stringify(staffView)).not.toContain(text);
  }
  await request(app).get(root + '/' + customer.user.id).set(headers(admin)).expect(404);
  await request(app).get(root + '/bad-id').set(headers(admin)).expect(404);
});
test('activity paginates ties without customer information or duplicate visits', async () => {
  const path = root + '/' + employee.user.id + '/activity';
  const first = (await request(app).get(path).set(headers(staff)).expect(200)).body.data;
  expect(first.items).toHaveLength(20);
  const next = (await request(app).get(path + '?cursor=' + first.nextCursor).set(headers(staff)).expect(200)).body.data;
  expect(next.items).toHaveLength(3); expect(new Set([...first.items, ...next.items].map(r => r.id)).size).toBe(23);
  expect(JSON.stringify(first)).not.toMatch(/private-customer|private-pet/);
  await request(app).get(path + '?days=7&cursor=' + first.nextCursor).set(headers(staff)).expect(422);
});
test('contract revisions select the latest effective version and do not fall back when it expires', async () => {
  const employeeId = new mongoose.Types.ObjectId(employee.user.id);
  const result = await col('employmentcontracts').insertOne({ employeeId, signedAt: new Date(1), effectiveAt: new Date(1), employmentType: 'FULL_TIME', version: 2 });
  const response = await request(app).get(root + '/' + employee.user.id).set(headers(admin)).expect(200);
  expect(response.body.data.employmentType).toBe('FULL_TIME');
  expect(response.body.data.contracts).toHaveLength(1); expect(response.body.data.contracts[0].version).toBe(2);
  expect(response.body.data.capabilities.areas).toEqual(['DISTRICT_TAY_HO']);
  await col('employmentcontracts').updateOne({ _id: result.insertedId }, { $set: { endsAt: new Date(2) } });
  expect((await request(app).get(root + '/' + employee.user.id).set(headers(admin))).body.data.employmentType).toBe('MISSING');
  await col('employmentcontracts').deleteOne({ _id: result.insertedId });
  await col('employmentcontracts').updateMany({ employeeId }, { $set: { endsAt: new Date(0) } });
  expect((await request(app).get(root + '/' + employee.user.id).set(headers(admin))).body.data.employmentType).toBe('MISSING');
});

test('Admin contract version includes future and expired records while unconfigured employees start at zero', async () => {
  const target = new mongoose.Types.ObjectId(employee.user.id);
  const latest = await col('employmentcontracts').insertOne({ employeeId: target, signedAt: new Date(),
    effectiveAt: new Date(Date.now() + 86400000), version: 7, employmentType: 'FULL_TIME' });
  try {
    const detail = (await request(app).get(root + '/' + employee.user.id).set(headers(admin)).expect(200)).body.data;
    expect(detail.contractVersion).toBe(7);
    expect(detail.contracts.every(contract => contract.version !== 7)).toBe(true);
    const demo = await col('users').findOne({ fixtureKey: 'coursework-demo:0' });
    const empty = (await request(app).get(root + '/' + demo._id).set(headers(admin)).expect(200)).body.data;
    expect(empty.contractVersion).toBe(0);
    expect(empty.permissions.manageContract).toBe(false);
  } finally { await col('employmentcontracts').deleteOne({ _id: latest.insertedId }); }
});

test('published customer ratings alone contribute; moderated queue can target the selected sitter', async () => {
  const sitterId = new mongoose.Types.ObjectId(employee.user.id);
  await col('reviews').insertMany([
    { sitterId, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 4, comment: 'private-comment' },
    { sitterId, direction: 'CUSTOMER_TO_SITTER', state: 'DRAFT', rating: 1 },
    { sitterId, direction: 'SITTER_TO_CUSTOMER', state: 'PUBLISHED', rating: 1 }
  ]);
  const result = await request(app).get(root + '/' + employee.user.id).set(headers(staff)).expect(200);
  expect(result.body.data.rating).toEqual({ available: true, count: 1, average: 4 });
  expect(JSON.stringify(result.body)).not.toContain('private-comment');
  await col('sitterpublicprofiles').insertMany([{ userId: sitterId, state: 'SUBMITTED', version: 1, bio: 'Synthetic bio', areas: ['HN'], updatedAt: new Date() },
    { userId: new mongoose.Types.ObjectId(), state: 'SUBMITTED', version: 1, bio: 'Other bio', areas: ['HN'], updatedAt: new Date() }]);
  const pending = await request(app).get('/api/v1/sitter-public-profiles?userId=' + employee.user.id).set(headers(staff)).expect(200);
  expect(pending.body.data.items).toHaveLength(1); expect(pending.body.data.items[0].userId).toBe(employee.user.id);
  await request(app).get('/api/v1/sitter-public-profiles?userId[$ne]=').set(headers(staff)).expect(422);
});


test('Staff/Admin capability command is session/CSRF protected and exposes readiness without private origins', async () => {
  await provisionEmployeeScheduling(connection);
  const target = employee.user.id, url = root + '/' + target + '/capability';
  await col('employmentcontracts').updateMany({ employeeId: new mongoose.Types.ObjectId(target) }, { $unset: { endsAt: '' } });
  const serviceId = new mongoose.Types.ObjectId();
  await col('services').insertOne({ _id: serviceId, code: 'synthetic-skill' });
  const body = { expectedVersion: 0, serviceIds: [String(serviceId)], species: ['DOG'], allowedTraits: [], maxPets: 2, maxWeightKg: 12, active: true, reason: 'Synthetic skill assessed' };
  await request(app).put(url).send(body).expect(401);
  await request(app).put(url).set(headers(customer)).send(body).expect(403);
  await request(app).put(url).set({ ...headers(staff), 'X-CSRF-Token': 'invalid' }).send(body).expect(403);
  const send = (actor, payload, key) => request(app).put(url).set(headers(actor)).set('Idempotency-Key', key).send(payload);
  const before = await col('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(target) });
  await send(staff, body, 'staff-capability-command').expect(200);
  await send(staff, body, 'staff-capability-command').expect(200);
  await send(admin, body, 'admin-stale-command').expect(409);
  await send(admin, { ...body, expectedVersion: 1, starts: [] }, 'no-override-origins').expect(422);
  const after = await col('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(target) });
  expect(after.starts).toEqual(before.starts); expect(after.version).toBe(1);
  const detail = (await request(app).get(root + '/' + target).set(headers(staff)).expect(200)).body.data;
  expect(detail.permissions.manageCapability).toBe(true); expect(detail.capabilities.version).toBe(1);
  expect(JSON.stringify(detail)).not.toContain('private-location');
});

describe('UC-74 Staff sitter list', () => {
  const oid = () => new mongoose.Types.ObjectId();
  const ids = Array.from({ length: 24 }, oid);
  const phone = '+84912001234';
  let fixtureTime;
  beforeAll(async () => {
    fixtureTime = new Date();
    const timeAgo = days => new Date(+fixtureTime - days * 86400000);
    await col('users').insertMany(ids.map((id, index) => ({
      _id: id, displayName: index === 0 ? 'Nguyễn [An]' : index === 1 ? 'Trần Bình' : 'Ứ'.repeat(98) + String(index).padStart(2, '0'),
      roles: ['PET_SITTER'], state: index === 23 ? 'LOCKED' : 'ACTIVE'
    })));
    await col('sitterstatuses').insertMany(ids.map((userId, index) => ({
      userId, status: index === 22 ? 'SUSPENDED' : 'ACTIVE'
    })));
    await col('employmentcontracts').insertMany(ids.filter((_id, index) => index !== 2).map(employeeId => ({
      employeeId, employmentType: employeeId.equals(ids[1]) ? 'FULL_TIME' : 'PART_TIME',
      ...(employeeId.equals(ids[0]) ? { employeeCode: 'NV-TEST-001' } : {}),
      signedAt: timeAgo(32), effectiveAt: timeAgo(31), version: 1
    })));
    await col('employeeavailabilities').insertOne({
      _id: String(ids[0]), areas: ['DISTRICT_CAU_GIAY', 'DISTRICT_DONG_DA'], dayOffDates: ['2099-01-01']
    });
    await col('employeeavailabilityrevisions').insertMany([
      { sitterId: String(ids[0]), effectiveFrom: '2000-01-01', version: 1,
        workingWindows: [{ weekday: 1, startLocalTime: '08:00', endLocalTime: '12:00', privateMarker: 'omit-me' }] },
      { sitterId: String(ids[0]), effectiveFrom: '2099-01-01', version: 2,
        workingWindows: [{ weekday: 2, startLocalTime: '09:00', endLocalTime: '14:00' }] }
    ]);
    const crypto = createContactCrypto({ lookupSecret: 'd'.repeat(48), encryptionKey: 'e'.repeat(32) });
    await col('contacts').insertMany([
      { userId: ids[0], channel: 'PHONE', state: 'VERIFIED', lookupKey: crypto.lookup('PHONE', phone).lookupKey,
        canonicalCiphertext: crypto.encrypt(phone) },
      { userId: ids[1], channel: 'PHONE', state: 'REPLACED', canonicalCiphertext: crypto.encrypt(phone) }
    ]);
    await col('reviews').insertMany([
      { sitterId: String(ids[0]), direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 4 },
      { sitterId: ids[0], direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 5 },
      { sitterId: String(ids[0]), direction: 'CUSTOMER_TO_SITTER', state: 'PENDING', rating: 1 },
      { sitterId: String(ids[1]), direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 5 }
    ]);
    const visit = (days, minutes, state = 'COMPLETED') => {
      const startAt = timeAgo(days);
      return { sitterId: ids[0], startAt, state,
        ...(minutes === null ? {} : { checkInAt: new Date(+startAt + minutes * 60000) }) };
    };
    await col('visits').insertMany([visit(3, 5), visit(4, 6), visit(5, 9), visit(31, 9), visit(2, null),
      visit(3, 12, 'SUPERSEDED'), visit(-3, 8)]);
  });

  const read = (query, actor) => {
    const result = request(app).get(root).query({ view: 'staffList', ...query });
    return actor ? result.set(headers(actor)) : result;
  };

  test('GBR-03 protects the Staff view and preserves active contract totals when search and area are applied', async () => {
    await read({}).expect(401);
    await read({}, customer).expect(403);
    await read({}, employee).expect(403);
    const result = (await read({}, admin).expect(200)).body.data;
    expect(result.tabCounts).toEqual({ all: 23, partTime: 21, fullTime: 1 });
    expect(result.total).toBe(23);
    expect(result.withdrawalsAvailable).toBe(false);
    expect(result.items.every(item => item.status === 'ACTIVE' && item.accountState === 'ACTIVE')).toBe(true);
    const fullTime = (await read({ employmentType: 'FULL_TIME' }, staff).expect(200)).body.data;
    expect(fullTime.items.map(item => item.id)).toEqual([String(ids[1])]);
    const allPartTime = (await read({ employmentType: 'PART_TIME' }, staff).expect(200)).body.data;
    expect(allPartTime.total).toBe(21);
    const missing = (await read({ search: String(ids[2]).slice(-6) }, staff).expect(200)).body.data;
    expect(missing.items[0]).toMatchObject({ id: String(ids[2]), employmentType: 'MISSING' });
    for (const search of ['[an]', 'test-001', '0912 001 234', phone, '1234']) {
      const response = await read({ search, employmentType: 'PART_TIME', area: 'DISTRICT_CAU_GIAY' }, staff).expect(200);
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.body.data.tabCounts).toEqual(result.tabCounts);
      expect(response.body.data.items).toEqual([expect.objectContaining({ id: String(ids[0]), code: 'NV-TEST-001' })]);
      expect(JSON.stringify(response.body)).not.toMatch(/84912001234|canonicalCiphertext|omit-me/);
    }
    const none = (await read({ search: 'không có người này' }, staff).expect(200)).body.data;
    expect(none.items).toEqual([]);
    expect(none.tabCounts).toEqual(result.tabCounts);
  });

  test('GBR-29 and GBR-48 count authoritative data, keep missing sources unknown, and paginate both available sorts', async () => {
    const results = {};
    for (const sort of ['rating', 'lateCheckIns']) {
      const first = (await read({ sort }, staff).expect(200)).body.data;
      expect(first.items).toHaveLength(20);
      const second = (await read({ sort, cursor: first.nextCursor }, staff).expect(200)).body.data;
      const items = [...first.items, ...second.items];
      expect(new Set(items.map(item => item.id)).size).toBe(23);
      expect(second.asOf).toBe(first.asOf);
      expect(second.nextCursor).toBeNull();
      expect(items[0].id).toBe(String(sort === 'rating' ? ids[1] : ids[0]));
      results[sort] = items;
      await read({ sort: sort === 'rating' ? 'lateCheckIns' : 'rating', cursor: first.nextCursor }, staff).expect(422);
    }
    const rating = results.rating;
    expect(rating[1]).toMatchObject({ id: String(ids[0]), rating: 4.5, lateCheckIns: 2, withdrawals: null,
      approvedLeave: null, shift: null, workingWindows: [{ weekday: 1, startLocalTime: '08:00', endLocalTime: '12:00' }] });
    expect(rating.at(-1).rating).toBeNull();
    expect(rating[0]).toMatchObject({ lateCheckIns: 0, workingWindows: [], shift: null });
    await read({ sort: 'withdrawals' }, staff).expect(422);
    await request(app).get(root).query({ sort: 'rating' }).set(headers(staff)).expect(422);
  });
});

test('Staff leaderboard keeps exact global ordering and totals when winners appear after two cursor batches', async () => {
  const ids = Array.from({ length: 251 }, () => new mongoose.Types.ObjectId());
  await col('users').insertMany(ids.map((id, index) => ({ _id: id, displayName: `BOUND ${String(index).padStart(3, '0')}`,
    roles: ['PET_SITTER'], state: 'ACTIVE', synthetic: false })));
  await col('sitterstatuses').insertMany(ids.map(userId => ({ userId, status: 'ACTIVE' })));
  await col('reviews').insertMany(ids.map((userId, index) => ({ sitterId: String(userId), direction: 'CUSTOMER_TO_SITTER',
    state: 'PUBLISHED', rating: index >= 248 ? 5 : 1 })));
  const read = cursor => request(app).get(root).query({ view: 'staffList', search: 'BOUND', limit: '2', ...(cursor ? { cursor } : {}) }).set(headers(staff));
  const first = (await read().expect(200)).body.data;
  expect(first.total).toBe(251);
  expect(first.items.map(row => row.id)).toEqual(ids.slice(248, 250).map(String));
  const next = (await read(first.nextCursor).expect(200)).body.data;
  expect(next.total).toBe(251);
  expect(next.tabCounts).toEqual(first.tabCounts);
  expect(next.items.map(row => row.id)).toEqual([String(ids[250]), String(ids[0])]);
  expect(next.asOf).toBe(first.asOf);
});

test('management distinguishes a verified signed upcoming contract from an absent contract', async () => {
 const employeeId=new mongoose.Types.ObjectId(employee.user.id),effectiveAt=new Date(Date.now()+86400000);
 await col('employmentcontracts').updateOne({employeeId},{$set:{effectiveAt,verifiedBy:new mongoose.Types.ObjectId(admin.user.id)}});
 try{
 const result=await request(app).get(root+'/'+employee.user.id).set(headers(admin)).expect(200);
 expect(result.body.data.employmentType).toBe('MISSING');expect(result.body.data.contracts).toEqual([]);
 expect(result.body.data.upcomingContract).toMatchObject({effectiveAt:effectiveAt.toISOString(),employmentType:'PART_TIME'});
 expect(result.body.data.permissions.manageCapability).toBe(true);
 }finally{await col('employmentcontracts').updateOne({employeeId},{$set:{effectiveAt:new Date(0)}});}
});
