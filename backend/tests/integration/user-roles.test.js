import { afterAll, beforeAll, beforeEach, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { startRuntime } from '../../src/runtime.js';
import { userModel } from '../../src/models/user.model.js';
import { userAdminAuditModel } from '../../src/models/user-admin-audit.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { createSessionService } from '../../src/services/session.service.js';

let replica, runtime, User, Audit, sessions, admin, target, staff;
const base = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  runtime = await startRuntime({ env: { NODE_ENV: 'test', PORT: '0', MONGO_URI: replica.getUri(), MONGO_DB: 'user_roles_test',
    AUTH_ENABLED: 'true', OTP_HMAC_SECRET: 'o'.repeat(32), SESSION_TOKEN_SECRET: 't'.repeat(32),
    SESSION_CSRF_SECRET: 'c'.repeat(32), CONTACT_LOOKUP_SECRET: 'l'.repeat(32), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32) } });
  User = userModel(runtime.connection); Audit = userAdminAuditModel(runtime.connection);
  sessions = createSessionService({ connection: runtime.connection, tokenSecret: 't'.repeat(32), csrfSecret: 'c'.repeat(32) });
}, 600000);
async function actor(roles, name) {
  const user = await User.create({ displayName: 'Synthetic ' + name, roles, state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  let issued; await runtime.connection.transaction(async session => { issued = await sessions.issueInTransaction(user, session); });
  return { user, headers: { ...base, Cookie: 'pwc_session=' + issued.token, 'X-CSRF-Token': issued.csrfToken } };
}
beforeEach(async () => {
  await User.deleteMany({}); await Audit.deleteMany({}); await identityModels(runtime.connection).AuthSession.deleteMany({});
  admin = await actor(['ADMIN'], 'Admin'); target = await actor(['CUSTOMER'], 'Customer'); staff = await actor(['STAFF'], 'Staff');
});
afterAll(async () => { await runtime?.stop(); await replica?.stop(); }, 30000);
function change(who = admin, account = target, body = {}) {
  return request(runtime.server).post(`/api/v1/users/${account.user.id}/role-decisions`).set(who.headers)
    .send({ roles: ['CUSTOMER', 'STAFF'], reason: 'Synthetic authorization decision', expectedVersion: 0, ...body });
}
test('role changes persist with audit and revoke all old sessions; a fresh session gets new permissions', async () => {
  const result = await change().expect(200);
  expect(result.body.data).toEqual({ userId: target.user.id, roles: ['CUSTOMER', 'STAFF'], version: 1 });
  const stored = await User.findById(target.user.id).lean();
  expect(stored).toMatchObject({ roles: ['CUSTOMER', 'STAFF'], authEpoch: 1, version: 1 });
  await request(runtime.server).get('/api/v1/me').set(target.headers).expect(401);
  const audit = await Audit.findOne({ resourceId: target.user.id }).lean();
  expect(audit).toMatchObject({ action: 'USER_ROLES_CHANGED', previousRoles: ['CUSTOMER'], roles: ['CUSTOMER', 'STAFF'], reason: 'Synthetic authorization decision' });
  expect(audit.actorId.toString()).toBe(admin.user.id);
  let fresh; await runtime.connection.transaction(async session => { fresh = await sessions.issueInTransaction(stored, session); });
  await request(runtime.server).get('/api/v1/me').set('Cookie', 'pwc_session=' + fresh.token).expect(200)
    .expect(res => expect(res.body.data.user.roles).toEqual(['CUSTOMER', 'STAFF']));
  await change(admin, target, { roles: ['ADMIN'], expectedVersion: 1 }).expect(200);
  await change(admin, target, { roles: ['CUSTOMER'], expectedVersion: 2 }).expect(200);
  expect((await User.findById(target.user.id)).roles).toEqual(['CUSTOMER']);
});
test('guest, non-Admin and missing CSRF cannot change roles', async () => {
  await request(runtime.server).post(`/api/v1/users/${target.user.id}/role-decisions`).send({}).expect(401);
  await change(staff).expect(403); await change(target).expect(403);
  const headers = { ...admin.headers }; delete headers['X-CSRF-Token'];
  await request(runtime.server).post(`/api/v1/users/${target.user.id}/role-decisions`).set(headers).send({}).expect(403);
  expect(await Audit.countDocuments()).toBe(0);
});
test('invalid, empty, duplicate, unchanged roles and short reason are rejected without writes', async () => {
  for (const body of [{ roles: [] }, { roles: ['UNKNOWN'] }, { roles: ['STAFF', 'STAFF'] }, { roles: ['CUSTOMER'] }, { reason: 'x' }, { unexpected: true }, { expectedVersion: -1 }]) await change(admin, target, body).expect(422);
  expect(await Audit.countDocuments()).toBe(0);
  expect((await User.findById(admin.user.id)).version).toBe(0);
});
test('self changes are blocked and Pet Sitter access stays in application/status review', async () => {
  await change(admin, admin, { roles: ['CUSTOMER'] }).expect(409).expect(res => expect(res.body.error.code).toBe('SELF_ROLE_CHANGE_FORBIDDEN'));
  await change(admin, target, { roles: ['PET_SITTER'] }).expect(409).expect(res => expect(res.body.error.code).toBe('SITTER_ROLE_MANAGED'));
  await User.updateOne({ _id: target.user.id }, { $set: { roles: ['PET_SITTER'] } });
  await change(admin, target, { roles: ['CUSTOMER'] }).expect(409);
  await change(admin, target, { roles: ['PET_SITTER', 'STAFF'] }).expect(200);
});
test('stale version and concurrent commands do not overwrite each other', async () => {
  const results = await Promise.all([change(), change(admin, target, { roles: ['ADMIN'] })]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(await Audit.countDocuments({ resourceId: target.user.id })).toBe(1);
});
test('two Admins cannot concurrently remove each other and leave no active Admin', async () => {
  const other = await actor(['ADMIN'], 'Other Admin');
  const results = await Promise.all([change(admin, other, { roles: ['CUSTOMER'] }), change(other, admin, { roles: ['CUSTOMER'] })]);
  expect(results.map(result => result.status).sort()).toEqual([200, 403]);
  expect(await User.countDocuments({ roles: 'ADMIN', state: 'ACTIVE' })).toBe(1);
});
test('missing and hidden accounts return 404 without writes', async () => {
  await change(admin, { user: { id: 'f'.repeat(24) } }).expect(404);
  await User.updateOne({ _id: target.user.id }, { $set: { synthetic: true } });
  await change().expect(404);
  expect(await Audit.countDocuments()).toBe(0);
  expect((await User.findById(admin.user.id)).version).toBe(0);
});

test('audit failure rolls back roles, session revocation and actor version', async () => {
  const failure = jest.spyOn(Audit, 'create').mockRejectedValueOnce(new Error('Synthetic audit failure'));
  try { await change().expect(500); } finally { failure.mockRestore(); }
  expect((await User.findById(target.user.id)).toObject()).toMatchObject({ roles: ['CUSTOMER'], version: 0, authEpoch: 0 });
  expect((await User.findById(admin.user.id)).version).toBe(0);
  await request(runtime.server).get('/api/v1/me').set(target.headers).expect(200);
  expect(await Audit.countDocuments()).toBe(0);
});
