import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { userModel } from '../../src/models/user.model.js';
import { singleAccountRoleOptions } from '../../src/models/user-role.storage.js';
import { inspectSingleAccountRoles, migrateSingleAccountRoles, restoreSingleAccountRoleValidator,
  assertSingleAccountRoleStorage, SINGLE_ACCOUNT_ROLE_CONTRACT } from '../../src/services/single-account-role.service.js';

let replica, connection, ids;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }], replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_single_role',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
}, 600000);
beforeEach(async () => {
  await connection.dropDatabase(); ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  await connection.db.createCollection('users');
  await connection.db.collection('users').createIndex({ fixtureKey: 1 }, { unique: true, sparse: true });
  await connection.db.collection('users').insertMany(ids.map((_id, index) => ({ _id, displayName: `Synthetic ${index}`,
    roles: index === 0 ? ['ADMIN'] : index === 1 ? ['CUSTOMER', 'PET_SITTER'] : index === 2 ? ['CUSTOMER', 'STAFF'] : ['CUSTOMER'],
    state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false, contractGuard: 7,
    createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01') })));
  await connection.db.collection('authsessions').insertMany([0, 1].map(index => ({ _id: new mongoose.Types.ObjectId(), userId: ids[index],
    revokedAt: null, authEpochAtIssue: 0, syntheticProof: 'retained-token-free-fixture' })));
  await connection.db.collection('synthetic_financial_facts').insertOne({ _id: 'immutable', amountVnd: 123, state: 'PAID' });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); });
async function input(extra = {}) {
  const before = await inspectSingleAccountRoles(connection.db);
  return { connection, database: connection.name, contract: SINGLE_ACCOUNT_ROLE_CONTRACT, digest: before.digest,
    writersFrozen: true, checkpoint: async () => {}, ...extra };
}

test('dry-run is read-only; only unambiguous legacy membership is replaced, with epoch/version and scoped session revocation', async () => {
  const commands = [], listener = e => commands.push(e.commandName);connection.getClient().on('commandStarted', listener);
  const plan = await inspectSingleAccountRoles(connection.db);connection.getClient().off('commandStarted', listener);
  expect(commands.some(x => ['insert', 'update', 'drop', 'collMod', 'create', 'createIndexes'].includes(x))).toBe(false);
  expect(plan).toMatchObject({ documents: 4, readyForApply: true, blocked: [], totals: { ADMIN: 1, STAFF: 1, PET_SITTER: 1, CUSTOMER: 1 } });
  expect(plan.targets).toHaveLength(2);
  let journal;
  expect(await migrateSingleAccountRoles(await input({ checkpoint: async value => { journal = JSON.parse(JSON.stringify(value)); } })))
    .toMatchObject({ state: 'APPLIED', changedUsers: 2, revokedSessions: 1, indexesChanged: false });
  for (const [index, role] of [[1, 'PET_SITTER'], [2, 'STAFF']]) {
    expect(await connection.db.collection('users').findOne({ _id: ids[index] }))
      .toMatchObject({ roles: [role], authEpoch: 1, version: 1, contractGuard: 7, state: 'ACTIVE' });
  }
  expect(await connection.db.collection('users').findOne({ _id: ids[0] })).toMatchObject({ roles: ['ADMIN'], authEpoch: 0, version: 0 });
  expect(await connection.db.collection('authsessions').findOne({ userId: ids[0] })).toMatchObject({ revokedAt: null });
  expect((await connection.db.collection('authsessions').findOne({ userId: ids[1] })).revokedAt).toBeInstanceOf(Date);
  expect(await connection.db.collection('synthetic_financial_facts').findOne({ _id: 'immutable' })).toEqual({ _id: 'immutable', amountVnd: 123, state: 'PAID' });
  expect(journal).toMatchObject({ state: 'APPLIED', inProgress: null, changedUsers: 2 });
  await assertSingleAccountRoleStorage(connection.db);
  expect(await migrateSingleAccountRoles(await input())).toMatchObject({ changedUsers: 0, revokedSessions: 0 });
});

test('Mongoose and native storage reject empty, duplicate, mixed, missing and unknown roles; singleton roles remain valid', async () => {
  const User = userModel(connection);
  for (const role of ['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']) {
    await expect(new User({ displayName: 'Synthetic', roles: [role], state: 'ACTIVE' }).validate()).resolves.toBeUndefined();
  }
  for (const roles of [[], ['CUSTOMER', 'CUSTOMER'], ['CUSTOMER', 'PET_SITTER'], ['ROOT']]) {
    await expect(new User({ displayName: 'Synthetic', roles, state: 'ACTIVE' }).validate()).rejects.toThrow();
  }
  await migrateSingleAccountRoles(await input());
  for (const roles of [[], ['CUSTOMER', 'CUSTOMER'], ['ADMIN', 'STAFF'], ['ROOT'], 'CUSTOMER', null]) {
    await expect(connection.db.collection('users').updateOne({ _id: ids[0] }, { $set: { roles } })).rejects.toMatchObject({ code: 121 });
  }
  await expect(connection.db.collection('users').updateOne({ _id: ids[0] }, { $unset: { roles: '' } })).rejects.toMatchObject({ code: 121 });
  expect((await connection.db.collection('users').findOne({ _id: ids[0] })).roles).toEqual(['ADMIN']);
});

test('missing explicit confirmation/freeze, foreign database, stale preimages and ambiguous role combinations stop without migration', async () => {
  const valid = await input();
  for (const patch of [{ writersFrozen: false }, { contract: 'other' }, { database: 'other' }, { digest: '0'.repeat(64) }, { checkpoint: null }]) {
    await expect(migrateSingleAccountRoles({ ...valid, ...patch })).rejects.toThrow();
  }
  await connection.db.collection('users').updateOne({ _id: ids[1] }, { $set: { displayName: 'Synthetic concurrently changed' } });
  await expect(migrateSingleAccountRoles(valid)).rejects.toThrow('ROLE_PREFLIGHT_CHANGED');
  await connection.db.collection('users').updateOne({ _id: ids[1] }, { $set: { roles: ['ADMIN', 'STAFF', 'CUSTOMER'] } });
  const plan = await inspectSingleAccountRoles(connection.db);expect(plan.readyForApply).toBe(false);
  expect(plan.blocked).toContainEqual({ id: ids[1].toString(), code: 'AMBIGUOUS_OR_INVALID_ROLES' });
  await expect(migrateSingleAccountRoles(await input())).rejects.toThrow('BLOCKED');
  expect((await connection.db.collection('users').findOne({ _id: ids[2] })).roles).toEqual(['CUSTOMER', 'STAFF']);
});

test('duplicate copies of one role collapse; string/overflow counters and unknown roles are never guessed', async () => {
  await connection.db.collection('users').updateOne({ _id: ids[1] }, { $set: { roles: ['CUSTOMER', 'CUSTOMER'] } });
  expect((await inspectSingleAccountRoles(connection.db)).targets.find(x => x.id === ids[1].toString()).afterRoles).toEqual(['CUSTOMER']);
  for (const version of ['1', Number.MAX_SAFE_INTEGER, -1, 0.5]) {
    await connection.db.collection('users').updateOne({ _id: ids[1] }, { $set: { version } });
    expect((await inspectSingleAccountRoles(connection.db)).readyForApply).toBe(false);
  }
  await connection.db.collection('users').updateOne({ _id: ids[1] }, { $set: { version: 0, roles: ['ROOT'] } });
  expect((await inspectSingleAccountRoles(connection.db)).blocked).toContainEqual({ id: ids[1].toString(), code: 'AMBIGUOUS_OR_INVALID_ROLES' });
});

test('foreign native validators block, without changing existing indexes, options or accounts', async () => {
  await connection.db.command({ collMod: 'users', validator: { displayName: { $exists: true } } });
  const before = await inspectSingleAccountRoles(connection.db);expect(before.foreignValidator).toBe(true);
  await expect(migrateSingleAccountRoles(await input())).rejects.toThrow('BLOCKED');
  expect((await inspectSingleAccountRoles(connection.db)).digest).toBe(before.digest);
});

test('a concurrent edit after preflight is detected inside the transaction without overwriting that edit', async () => {
  let changed = false;
  const options = await input({ checkpoint: async journal => {
    if (journal.state === 'PREPARED' && !changed) {
      changed = true;
      await connection.db.collection('users').updateOne({ _id: ids[3] }, { $set: { displayName: 'Synthetic concurrent fact' } });
    }
  } });
  await expect(migrateSingleAccountRoles(options)).rejects.toThrow('ROLE_SOURCE_CHANGED');
  expect((await connection.db.collection('users').findOne({ _id: ids[1] })).roles).toEqual(['CUSTOMER', 'PET_SITTER']);
  expect((await connection.db.collection('users').findOne({ _id: ids[3] })).displayName).toBe('Synthetic concurrent fact');
  expect(await connection.db.collection('authsessions').countDocuments({ revokedAt: null })).toBe(2);
});

test('lost journal acknowledgement after role commit resumes metadata from a fresh plan without repeating epoch/session changes', async () => {
  let failed = false;
  await expect(migrateSingleAccountRoles(await input({ checkpoint: async journal => {
    if (journal.state === 'ROLES_COMMITTED' && !failed) { failed = true;throw new Error('synthetic-post-commit-journal-failure'); }
  } }))).rejects.toThrow('synthetic-post-commit-journal-failure');
  expect((await connection.db.collection('users').findOne({ _id: ids[1] })).authEpoch).toBe(1);
  expect(await migrateSingleAccountRoles(await input())).toMatchObject({ state: 'APPLIED', changedUsers: 0, revokedSessions: 0 });
  expect((await connection.db.collection('users').findOne({ _id: ids[1] })).authEpoch).toBe(1);
});

test('valid user writes during DDL block postflight acceptance and survive validator-only recovery', async () => {
  let journal;const original = connection.db.command.bind(connection.db);
  const wrapped = { name: connection.name, transaction: connection.transaction.bind(connection), db: {
    databaseName: connection.name, listCollections: connection.db.listCollections.bind(connection.db), collection: connection.db.collection.bind(connection.db),
    command: async (...args) => {
      const result = await original(...args);
      await connection.db.collection('users').updateOne({ _id: ids[3] }, { $set: { displayName: 'Synthetic valid concurrent write' } });
      return result;
    } } };
  await expect(migrateSingleAccountRoles({ ...await input(), connection: wrapped,
    checkpoint: async value => { journal = JSON.parse(JSON.stringify(value)); } })).rejects.toThrow('ROLE_POSTFLIGHT_CHANGED');
  await restoreSingleAccountRoleValidator({ db: connection.db, journal, ...await input() });
  expect((await connection.db.collection('users').findOne({ _id: ids[3] })).displayName).toBe('Synthetic valid concurrent write');
  expect((await connection.db.collection('users').findOne({ _id: ids[1] })).roles).toEqual(['PET_SITTER']);
});

test('journal failure before writes stops; session-update failure rolls the complete role transaction back', async () => {
  await expect(migrateSingleAccountRoles(await input({ checkpoint: async () => { throw new Error('synthetic-journal-failure'); } }))).rejects.toThrow('synthetic-journal-failure');
  const before = await inspectSingleAccountRoles(connection.db), original = connection.db.collection.bind(connection.db);
  const wrapped = { name: connection.name, db: { databaseName: connection.name, listCollections: connection.db.listCollections.bind(connection.db),
    collection: name => name === 'authsessions' ? { updateMany: async () => { throw new Error('synthetic-session-write-failure'); } } : original(name) },
    transaction: connection.transaction.bind(connection) };
  await expect(migrateSingleAccountRoles({ ...await input(), connection: wrapped })).rejects.toThrow('synthetic-session-write-failure');
  expect((await inspectSingleAccountRoles(connection.db)).digest).toBe(before.digest);
  expect(await connection.db.collection('authsessions').countDocuments({ revokedAt: null })).toBe(2);
});

test('transient write retry and unknown commit do not increment roles/epochs or revoke sessions twice', async () => {
  await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 },
    data: { failCommands: ['findAndModify'], errorCode: 112, errorLabels: ['TransientTransactionError'] } });
  await migrateSingleAccountRoles(await input());
  expect(await connection.db.collection('users').findOne({ _id: ids[1] })).toMatchObject({ roles: ['PET_SITTER'], version: 1, authEpoch: 1 });
  await connection.db.command({ collMod: 'users', validator: {} });
  await connection.db.collection('users').updateOne({ _id: ids[1] }, { $set: { roles: ['CUSTOMER', 'PET_SITTER'] } });
  await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 },
    data: { failCommands: ['commitTransaction'], errorCode: 91, errorLabels: ['UnknownTransactionCommitResult'] } });
  try { await migrateSingleAccountRoles(await input()); }
  finally { await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: 'off' }); }
  expect(await connection.db.collection('users').findOne({ _id: ids[1] })).toMatchObject({ version: 2, authEpoch: 2 });
});

test('lost collMod acknowledgement retains a recoverable journal; validator reverse preserves current single roles and new facts', async () => {
  const original = connection.db.command.bind(connection.db);let journal;
  const wrapped = { name: connection.name, transaction: connection.transaction.bind(connection), db: {
    databaseName: connection.name, listCollections: connection.db.listCollections.bind(connection.db), collection: connection.db.collection.bind(connection.db),
    command: async (...args) => { await original(...args);throw new Error('synthetic-lost-DDL-ack'); } } };
  await expect(migrateSingleAccountRoles({ ...await input(), connection: wrapped,
    checkpoint: async value => { journal = JSON.parse(JSON.stringify(value)); } })).rejects.toThrow('synthetic-lost-DDL-ack');
  expect(journal).toMatchObject({ state: 'PARTIAL', inProgress: 'USERS_VALIDATOR' });
  await connection.db.collection('users').updateOne({ _id: ids[3] }, { $set: { displayName: 'Synthetic new fact after migration' } });
  const current = await inspectSingleAccountRoles(connection.db);
  expect(await restoreSingleAccountRoleValidator({ db: connection.db, journal, ...await input(), digest: current.digest }))
    .toMatchObject({ state: 'VALIDATOR_RESTORED', userDataRestored: false, sessionsRestored: false });
  expect(await connection.db.collection('users').findOne({ _id: ids[3] })).toMatchObject({ displayName: 'Synthetic new fact after migration' });
  expect((await connection.db.collection('users').findOne({ _id: ids[1] })).roles).toEqual(['PET_SITTER']);
  expect((await connection.db.collection('authsessions').findOne({ userId: ids[1] })).revokedAt).toBeInstanceOf(Date);
});

test('restore rejects forged namespace/options even with a recomputed private-manifest digest', async () => {
  let journal;await migrateSingleAccountRoles(await input({ checkpoint: async value => { journal = JSON.parse(JSON.stringify(value)); } }));
  journal.before.options.collMod = 'synthetic_financial_facts';
  const manifest = { ...journal.before }; delete manifest.digest; delete manifest.readyForApply;
  journal.before.digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  await expect(restoreSingleAccountRoleValidator({ db: connection.db, journal, ...await input() })).rejects.toThrow('ROLE_ROLLBACK_MANIFEST_INVALID');
  await assertSingleAccountRoleStorage(connection.db);
});

test('new User collections receive the same strict role contract, without runtime replacing existing validators', async () => {
  await connection.db.collection('users').drop();
  await userModel(connection).createCollection();await assertSingleAccountRoleStorage(connection.db);
  expect((await connection.db.listCollections({ name: 'users' }).next()).options).toEqual(singleAccountRoleOptions);
  await connection.db.command({ collMod: 'users', validator: { displayName: { $exists: true } } });
  await userModel(connection).createCollection();
  await expect(assertSingleAccountRoleStorage(connection.db)).rejects.toThrow('SINGLE_ACCOUNT_ROLE_NOT_READY');
});

test('D-270 upgrades the exact four-role validator and restores it only after Sale Staff is removed', async () => {
  const users = connection.db.collection('users');
  const previous = { validator: { $jsonSchema: { bsonType: 'object', required: ['roles'], properties: {
    roles: { bsonType: 'array', minItems: 1, maxItems: 1, items: { enum: ['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'] } }
  } } }, validationLevel: 'strict', validationAction: 'error' };
  await users.updateOne({ _id: ids[1] }, { $set: { roles: ['PET_SITTER'] } });
  await users.updateOne({ _id: ids[2] }, { $set: { roles: ['STAFF'] } });
  await connection.db.command({ collMod: 'users', ...previous });
  const before = await inspectSingleAccountRoles(connection.db);
  let journal;
  await expect(migrateSingleAccountRoles(await input({ checkpoint: async value => { journal = JSON.parse(JSON.stringify(value)); } })))
    .resolves.toMatchObject({ changedUsers: 0, revokedSessions: 0, indexesChanged: false });
  await assertSingleAccountRoleStorage(connection.db);
  expect((await inspectSingleAccountRoles(connection.db)).dataHash).toBe(before.dataHash);
  const sale = await users.insertOne({ roles: ['SALE_STAFF'] });
  for (const roles of [['SALE_STAFF', 'STAFF'], ['UNSUPPORTED']]) {
    await expect(users.insertOne({ roles })).rejects.toMatchObject({ code: 121 });
  }
  await expect(restoreSingleAccountRoleValidator({ db: connection.db, journal, ...await input() }))
    .rejects.toThrow('ROLE_ROLLBACK_INCOMPATIBLE_USERS');
  await assertSingleAccountRoleStorage(connection.db);
  await users.updateOne({ _id: sale.insertedId }, { $set: { roles: ['STAFF'] } });
  await restoreSingleAccountRoleValidator({ db: connection.db, journal, ...await input() });
  expect((await connection.db.listCollections({ name: 'users' }).next()).options).toEqual(previous);
  await expect(users.insertOne({ roles: ['SALE_STAFF'] })).rejects.toMatchObject({ code: 121 });
});
