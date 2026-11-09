import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import { ACCOUNT_ROLES } from '../constants/account-roles.js';
import { singleAccountRoleOptions } from '../models/user-role.storage.js';

export const SINGLE_ACCOUNT_ROLE_CONTRACT = 'SINGLE_ACCOUNT_ROLE_V1';
const budget = { maxTimeMS: 5000, timeoutMS: 5000 }, CAP = 10000, BYTES = 16 * 1024 * 1024;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bsonHash = row => createHash('sha256').update(mongoose.mongo.BSON.serialize(row)).digest('hex');
const normalized = options => ({ validator: options?.validator ?? {},
  validationLevel: options?.validationLevel ?? 'strict', validationAction: options?.validationAction ?? 'error' });
const same = isDeepStrictEqual;
const safeCounter = value => (typeof value === 'number' || ['Int32', 'Long', 'Double'].includes(value?._bsontype))
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) < Number.MAX_SAFE_INTEGER;

function classify(roles) {
  if (!Array.isArray(roles) || !roles.length || roles.some(role => !ACCOUNT_ROLES.includes(role))) return null;
  const distinct = [...new Set(roles)], operational = distinct.filter(role => role !== 'CUSTOMER');
  if (operational.length > 1) return null;
  return operational.length ? operational : ['CUSTOMER'];
}

function protectedHash(row) {
  return bsonHash(Object.fromEntries(Object.entries(row).filter(([key]) => !['roles', 'version', 'authEpoch', 'updatedAt'].includes(key))));
}

async function users(db, session) {
  const rows = []; let bytes = 0;
  for await (const row of db.collection('users').find({}, { ...budget, promoteValues: false, ...(session ? { session } : {}) })
    .sort({ _id: 1 }).batchSize(100)) {
    bytes += mongoose.mongo.BSON.calculateObjectSize(row);
    if (rows.length >= CAP || bytes > BYTES) throw new Error('ROLE_READ_BUDGET_EXCEEDED');
    rows.push(row);
  }
  return rows;
}

export async function assertSingleAccountRoleStorage(db) {
  const info = await db.listCollections({ name: 'users' }, budget).next();
  if (!info || info.type !== 'collection' || !same(normalized(info.options), singleAccountRoleOptions))
    throw new Error('SINGLE_ACCOUNT_ROLE_NOT_READY');
}

export async function inspectSingleAccountRoles(db) {
  const info = await db.listCollections({ name: 'users' }, budget).next();
  if (!info || info.type !== 'collection') throw new Error('ROLE_USERS_UNAVAILABLE');
  const rows = await users(db), options = normalized(info.options), data = createHash('sha256');
  const indexes = (await db.collection('users').listIndexes(budget).toArray()).sort((a, b) => a.name.localeCompare(b.name));
  const targets = [], blocked = [], totals = Object.fromEntries(ACCOUNT_ROLES.map(role => [role, 0]));
  for (const row of rows) {
    data.update(mongoose.mongo.BSON.serialize(row));
    const afterRoles = classify(row.roles), id = row._id.toString();
    if (!afterRoles) { blocked.push({ id, code: 'AMBIGUOUS_OR_INVALID_ROLES' }); continue; }
    totals[afterRoles[0]]++;
    if (same(row.roles, afterRoles)) continue;
    if (row._id?._bsontype !== 'ObjectId' || !safeCounter(row.version) || !safeCounter(row.authEpoch)) {
      blocked.push({ id, code: 'UNSUPPORTED_ID_OR_COUNTER' }); continue;
    }
    targets.push({ id, beforeRoles: row.roles, afterRoles, version: Number(row.version), authEpoch: Number(row.authEpoch),
      dataHash: bsonHash(row), protectedHash: protectedHash(row) });
  }
  const sessions = await db.listCollections({ name: 'authsessions' }, budget).next();
  const foreignValidator = Object.keys(options.validator).length > 0 && !same(options.validator, singleAccountRoleOptions.validator);
  const manifest = { contract: SINGLE_ACCOUNT_ROLE_CONTRACT, database: db.databaseName, documents: rows.length,
    dataHash: data.digest('hex'), indexes, options, sessionCollectionExists: !!sessions, targets, blocked, totals, foreignValidator };
  return { ...manifest, digest: hash(manifest), readyForApply: !blocked.length && !foreignValidator };
}

function confirmation(db, input) {
  if (input.database !== db.databaseName || input.contract !== SINGLE_ACCOUNT_ROLE_CONTRACT || input.writersFrozen !== true
    || !/^[a-f0-9]{64}$/.test(input.digest ?? '') || typeof input.checkpoint !== 'function') throw new Error('ROLE_CONFIRMATION_REQUIRED');
}

export async function migrateSingleAccountRoles({ connection, ...input }) {
  const db = connection.db; confirmation(db, input);
  const before = await inspectSingleAccountRoles(db);
  if (before.digest !== input.digest || !before.readyForApply) throw new Error('ROLE_PREFLIGHT_CHANGED_OR_BLOCKED');
  const journal = { contract: SINGLE_ACCOUNT_ROLE_CONTRACT, database: db.databaseName, state: 'PREPARED', before,
    changedUsers: 0, revokedSessions: 0, inProgress: null };
  await input.checkpoint(journal);
  try {
    if (before.targets.length) {
      journal.state = 'MIGRATING_ROLES'; journal.inProgress = 'USER_TRANSACTION'; await input.checkpoint(journal);
      const now = new Date();
      const changed = await connection.transaction(async session => {
        const current = await users(db, session), data = createHash('sha256');
        for (const row of current) data.update(mongoose.mongo.BSON.serialize(row));
        if (current.length !== before.documents || data.digest('hex') !== before.dataHash) throw new Error('ROLE_SOURCE_CHANGED');
        for (const row of before.targets) {
          const saved = await db.collection('users').findOneAndUpdate({ _id: new mongoose.Types.ObjectId(row.id),
            roles: row.beforeRoles, version: row.version, authEpoch: row.authEpoch },
          { $set: { roles: row.afterRoles, updatedAt: now }, $inc: { version: 1, authEpoch: 1 } },
          { ...budget, session, returnDocument: 'after', promoteValues: false });
          if (!saved || protectedHash(saved) !== row.protectedHash) throw new Error('ROLE_SOURCE_CHANGED');
        }
        const revoked = before.sessionCollectionExists ? await db.collection('authsessions').updateMany({
          userId: { $in: before.targets.map(row => new mongoose.Types.ObjectId(row.id)) }, revokedAt: null
        }, { $set: { revokedAt: now } }, { ...budget, session }) : { modifiedCount: 0 };
        return { users: before.targets.length, sessions: revoked.modifiedCount };
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      journal.changedUsers = changed.users; journal.revokedSessions = changed.sessions;
      journal.state = 'ROLES_COMMITTED'; journal.inProgress = null; await input.checkpoint(journal);
    }
    const current = await inspectSingleAccountRoles(db);
    if (current.targets.length || current.blocked.length || current.foreignValidator || !same(current.indexes, before.indexes))
      throw new Error('ROLE_POST_TRANSACTION_CHANGED');
    if (!same(current.options, singleAccountRoleOptions)) {
      journal.inProgress = 'USERS_VALIDATOR'; await input.checkpoint(journal);
      await db.command({ collMod: 'users', ...singleAccountRoleOptions }, { timeoutMS: 5000 });
    }
    await assertSingleAccountRoleStorage(db);
    const after = await inspectSingleAccountRoles(db);
    if (after.targets.length || after.blocked.length || after.documents !== before.documents || !same(after.indexes, before.indexes)
      || after.dataHash !== current.dataHash) throw new Error('ROLE_POSTFLIGHT_CHANGED');
    journal.state = 'APPLIED'; journal.inProgress = null; journal.afterDigest = after.digest; await input.checkpoint(journal);
    return { state: 'APPLIED', changedUsers: journal.changedUsers, revokedSessions: journal.revokedSessions,
      documents: after.documents, totals: after.totals, digest: after.digest, indexesChanged: false };
  } catch (error) {
    journal.state = 'PARTIAL'; await input.checkpoint(journal); throw error;
  }
}

export async function restoreSingleAccountRoleValidator({ db, journal, ...input }) {
  confirmation(db, input);
  if (journal?.contract !== SINGLE_ACCOUNT_ROLE_CONTRACT || journal.database !== db.databaseName
    || journal.before?.contract !== SINGLE_ACCOUNT_ROLE_CONTRACT || journal.before.database !== db.databaseName)
    throw new Error('ROLE_ROLLBACK_MANIFEST_INVALID');
  const manifest = { ...journal.before }, digest = manifest.digest;
  delete manifest.digest; delete manifest.readyForApply;
  if (hash(manifest) !== digest || !same(manifest.options, normalized(manifest.options)) || (Object.keys(manifest.options?.validator ?? {}).length > 0
    && !same(manifest.options, singleAccountRoleOptions))) throw new Error('ROLE_ROLLBACK_MANIFEST_INVALID');
  const current = await inspectSingleAccountRoles(db);
  if (current.digest !== input.digest || current.foreignValidator) throw new Error('ROLE_ROLLBACK_SOURCE_CHANGED');
  const progress = { contract: SINGLE_ACCOUNT_ROLE_CONTRACT, database: db.databaseName, state: 'RESTORING_VALIDATOR', inProgress: 'users' };
  await input.checkpoint(progress);
  await db.command({ collMod: 'users', ...manifest.options }, { timeoutMS: 5000 });
  const after = await inspectSingleAccountRoles(db);
  if (after.dataHash !== current.dataHash || !same(after.indexes, current.indexes) || !same(after.options, manifest.options))
    throw new Error('ROLE_ROLLBACK_POSTFLIGHT_CHANGED');
  progress.state = 'VALIDATOR_RESTORED'; progress.inProgress = null; await input.checkpoint(progress);
  return { state: progress.state, userDataRestored: false, sessionsRestored: false, digest: after.digest };
}
