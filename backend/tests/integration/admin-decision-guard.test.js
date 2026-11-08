import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { userModel } from '../../src/models/user.model.js';
import { userAdminAuditModel } from '../../src/models/user-admin-audit.model.js';
import { createUserAdminService } from '../../src/services/user-admin.service.js';

let replica, connection, User, Audit, service, revocations;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_admin_guard' }).asPromise();
  User = userModel(connection); Audit = userAdminAuditModel(connection);
  await User.createCollection(); await Audit.createCollection();
  service = createUserAdminService({ connection, User, Audit, Contact: {},
    contactCrypto: { decrypt: value => value }, cursorSecret: 'synthetic-admin-guard-secret-at-least-32',
    sessionService: { revokeUserSessions: async (_id, { session }) => {
      await connection.collection('synthetic_revocations').insertOne({ userId: _id }, { session });
      revocations++;
    } } });
}, 600000);
beforeEach(async () => {
  await User.deleteMany({}); await Audit.deleteMany({});
  await connection.collection('synthetic_revocations').deleteMany({}); revocations = 0;
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
async function fixture() {
  const admin = await User.create({ displayName: 'Synthetic admin', roles: ['ADMIN'], state: 'ACTIVE' });
  const target = await User.create({ displayName: 'Synthetic customer', roles: ['CUSTOMER'], state: 'ACTIVE' });
  return { admin, target, actor: { userId: String(admin._id), roles: ['ADMIN'], state: 'ACTIVE' } };
}
const body = { action: 'LOCK', reason: 'Synthetic review', expectedVersion: 0 };
test.each(['LOCKED', 'DEMOTED', 'SYNTHETIC'])('rejects stale administrator snapshot after %s without target/audit/session changes', async kind => {
  const { admin, target, actor } = await fixture();
  await User.updateOne({ _id: admin._id }, { $set: kind === 'LOCKED' ? { state: 'LOCKED' }
    : kind === 'DEMOTED' ? { roles: ['CUSTOMER'] } : { synthetic: true } });
  await expect(service.decide({ userId: String(target._id), body, actor })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect((await User.findById(target._id)).state).toBe('ACTIVE');
  expect(await Audit.countDocuments()).toBe(0); expect(revocations).toBe(0);
});
test('self-lock increments target version once and prevents stale self-unlock', async () => {
  const { admin, actor } = await fixture();
  expect(await service.decide({ userId: String(admin._id), body, actor })).toMatchObject({ state: 'LOCKED', version: 1, authEpoch: 1 });
  await expect(service.decide({ userId: String(admin._id), actor, body: { ...body, action: 'UNLOCK', expectedVersion: 1 } }))
    .rejects.toMatchObject({ status: 403 });
  expect(await Audit.countDocuments()).toBe(1);
});
test('conflicting target version rolls back the actor guard and session/audit writes', async () => {
  const { admin, target, actor } = await fixture();
  await expect(service.decide({ userId: String(target._id), actor, body: { ...body, expectedVersion: 1 } }))
    .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  expect((await User.findById(admin._id)).version).toBe(0);
  expect(await Audit.countDocuments()).toBe(0); expect(revocations).toBe(0);
});
test('authorized lock and unlock preserve target CAS, audit and revocation', async () => {
  const { admin, target, actor } = await fixture();
  await service.decide({ userId: String(target._id), body, actor });
  expect(await service.decide({ userId: String(target._id), actor, body: { ...body, action: 'UNLOCK', expectedVersion: 1 } }))
    .toMatchObject({ state: 'ACTIVE', version: 2, authEpoch: 2 });
  expect((await User.findById(admin._id)).version).toBe(2);
  expect(await Audit.countDocuments()).toBe(2); expect(revocations).toBe(2);
});
test('transaction retry rechecks authority after demotion of its original snapshot', async () => {
  const { admin, target, actor } = await fixture(); let attempts = 0;
  const retrying = createUserAdminService({ connection: { transaction: (execute, options) => connection.transaction(async session => {
    attempts++;
    if (attempts === 1) {
      await User.findById(admin._id).session(session).lean();
      await User.updateOne({ _id: admin._id }, { $set: { roles: ['CUSTOMER'] }, $inc: { version: 1 } });
    }
    return execute(session);
  }, options) }, User, Audit, Contact: {}, contactCrypto: { decrypt: value => value },
  cursorSecret: 'synthetic-admin-retry-secret-at-least-32',
  sessionService: { revokeUserSessions: async () => { throw new Error('Revocation must not be reached'); } } });
  await expect(retrying.decide({ userId: String(target._id), actor, body })).rejects.toMatchObject({ status: 403 });
  expect(attempts).toBeGreaterThan(1);
  expect((await User.findById(target._id)).state).toBe('ACTIVE'); expect(await Audit.countDocuments()).toBe(0);
});
