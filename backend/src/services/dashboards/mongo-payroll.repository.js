import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';

const CURSOR_CONTEXT = 'p28-payroll-cursor\0';
const MAX_CURSOR_LENGTH = 512;
const SOURCE_VERSION_PREFIX = 'settlement-request/';

function validSecret(secret) {
  return typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= 32;
}

function literalRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dateOnlyStart(value) {
  return new Date(`${value}T00:00:00.000+07:00`);
}

function dateOnlyEnd(value) {
  const start = dateOnlyStart(value);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function fingerprint(scope, query) {
  return createHash('sha256').update(JSON.stringify({
    scope: { kind: scope.kind, userId: scope.userId, targetId: scope.targetId },
    query: { from: query.from ?? null, to: query.to ?? null,
      search: query.search ?? '', limit: query.limit }
  })).digest('base64url');
}

function sign(payload, secret) {
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(CURSOR_CONTEXT + payload).digest('base64url');
}

function encodeCursor(row, scope, query, secret) {
  const payload = Buffer.from(JSON.stringify({
    submittedAt: new Date(row.submittedAt).toISOString(), id: row.id,
    fingerprint: fingerprint(scope, query)
  })).toString('base64url');
  const envelope = JSON.stringify({ payload, signature: sign(payload, secret) });
  return Buffer.from(envelope).toString('base64url');
}

function invalidCursor() {
  throw new AppError(422, 'VALIDATION_FAILED', 'Payroll cursor is invalid');
}

function decodeCursor(value, scope, query, secret) {
  if (typeof value !== 'string' || value.length > MAX_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)) invalidCursor();
  let envelope;
  try {
    envelope = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    invalidCursor();
  }
  if (!envelope || typeof envelope.payload !== 'string'
    || typeof envelope.signature !== 'string') invalidCursor();
  const expected = Buffer.from(sign(envelope.payload, secret));
  const received = Buffer.from(envelope.signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) invalidCursor();
  let position;
  try {
    position = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8'));
  } catch {
    invalidCursor();
  }
  if (!position || position.fingerprint !== fingerprint(scope, query)
    || typeof position.id !== 'string' || !position.id || position.id.length > 128
    || !Number.isFinite(Date.parse(position.submittedAt))) invalidCursor();
  return { submittedAt: new Date(position.submittedAt), id: position.id };
}

function requestMatch(query, cursor, scope, secret) {
  const match = {};
  if (query.from || query.to) {
    match.submittedAt = {};
    if (query.from) match.submittedAt.$gte = dateOnlyStart(query.from);
    if (query.to) match.submittedAt.$lt = dateOnlyEnd(query.to);
  }
  if (cursor) {
    const position = decodeCursor(cursor, scope, query, secret);
    const previous = { $or: [{ submittedAt: { $lt: position.submittedAt } },
      { submittedAt: position.submittedAt, id: { $lt: position.id } }] };
    match.$and = [previous];
  }
  return match;
}

function userLookup(usersCollectionName) {
  return {
    $lookup: {
      from: usersCollectionName,
      let: { sitterId: '$sitterId' },
      pipeline: [{ $match: { roles: 'PET_SITTER',
        $expr: { $eq: [{ $toString: '$_id' }, '$$sitterId'] } } },
        { $project: { _id: 0, displayName: 1, updatedAt: 1 } }],
      as: 'sitter'
    }
  };
}

function projectItem(row) {
  const displayName = row.displayName;
  const submittedAt = row.submittedAt instanceof Date ? row.submittedAt : new Date(row.submittedAt);
  const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
  if (typeof row.id !== 'string' || !row.id || row.id.length > 128
    || typeof row.sitterId !== 'string' || !row.sitterId || row.sitterId.length > 128
    || typeof displayName !== 'string' || !displayName || displayName.length > 100
    || !Number.isSafeInteger(row.amountVnd) || row.amountVnd < 0
    || typeof row.status !== 'string' || !row.status
    || typeof row.requestWeekKey !== 'string'
    || !Number.isFinite(submittedAt.getTime()) || !Number.isFinite(updatedAt.getTime())
    || typeof row.policyVersion !== 'string' || !row.policyVersion
    || typeof row.decisionVersion !== 'string' || !row.decisionVersion) return null;
  const transferRecordedAt = row.transferRecordedAt === null || row.transferRecordedAt === undefined
    ? null : new Date(row.transferRecordedAt);
  if (row.transferRecordedAt !== null && row.transferRecordedAt !== undefined
    && !Number.isFinite(transferRecordedAt.getTime())) return null;
  return {
    id: row.id, sitterId: row.sitterId, displayName, state: row.status,
    amountVnd: row.amountVnd, requestWeekKey: row.requestWeekKey,
    transferRecordedAt: transferRecordedAt ? transferRecordedAt.toISOString() : null,
    submittedAt, updatedAt, policyVersion: row.policyVersion, decisionVersion: row.decisionVersion
  };
}

function sourceVersion(asOf) {
  return `${SOURCE_VERSION_PREFIX}${asOf.toISOString()}`.slice(0, 128);
}

/**
 * Mongoose connections expose `collection().aggregate()` as a Promise,
 * whereas the native MongoDB driver returns a cursor (`toArray`) and a
 * Mongoose model aggregate returns an Aggregate (`exec`). Keep the adapter
 * usable with the runtime connection and with either test/integration port
 * without assuming one driver's return shape.
 */
async function aggregateRows(store, pipeline, options) {
  const result = store.aggregate(pipeline, options);
  if (typeof result?.toArray === 'function') return result.toArray();
  if (typeof result?.exec === 'function') return result.exec();
  return result;
}

/**
 * Durable read adapter for P28 Admin payroll.
 *
 * SettlementRequest is the P41 authoritative request projection. This adapter
 * only reads persisted request rows and approved User display names; it never
 * calculates a payout, marks a transfer, or selects a policy. P41's required
 * policyVersion/decisionVersion fields are required before a page can be
 * exposed. Missing source rows or malformed joins return `ready: false` so the
 * HTTP boundary stays INTEGRATION_PENDING.
 */
export function createMongoPayrollRepository({ connection, requests,
  requestCollection = 'settlementrequests', userCollection = 'users',
  cursorSecret } = {}) {
  if (!connection?.collection && !requests) throw new TypeError('Mongo payroll connection is required');
  if (!validSecret(cursorSecret)) throw new TypeError('Payroll cursor secret is required');
  const requestStore = requests ?? connection.collection(requestCollection);
  if (!requestStore || typeof requestStore.aggregate !== 'function') throw new TypeError('Settlement request collection is required');

  async function readSnapshot({ scope, query }) {
    if (scope?.kind !== 'payroll' || !scope.userId || !scope.targetId) return { ready: false };
    const normalized = query ?? { limit: 20 };
    const match = requestMatch(normalized, normalized.cursor, scope, cursorSecret);
    const stages = [{ $match: match }];
    if (normalized.search) {
      stages.push(userLookup(userCollection));
      stages.push({ $match: { 'sitter.displayName': {
        $regex: literalRegex(normalized.search), $options: 'i'
      } } });
    }
    stages.push({ $sort: { submittedAt: -1, id: -1 } });
    if (!normalized.search) stages.push(userLookup(userCollection));
    stages.push({ $unwind: { path: '$sitter', preserveNullAndEmptyArrays: true } });
    stages.push({ $project: {
      _id: 0, id: 1, sitterId: 1, status: 1, amountVnd: 1, requestWeekKey: 1,
      submittedAt: 1, updatedAt: 1, policyVersion: 1, decisionVersion: 1,
      transferRecordedAt: '$transfer.paidAt', displayName: '$sitter.displayName',
      sitterUpdatedAt: '$sitter.updatedAt'
    } });
    stages.push({ $facet: {
      items: [{ $limit: normalized.limit + 1 }],
      source: [{ $group: { _id: null, asOf: { $max: '$updatedAt' },
        policyVersions: { $addToSet: '$policyVersion' }, total: { $sum: 1 } } }]
    } });
    const aggregateResultRows = await aggregateRows(requestStore, stages, { allowDiskUse: false });
    const [result] = Array.isArray(aggregateResultRows) ? aggregateResultRows : [];
    const source = result?.source?.[0];
    const rawItems = Array.isArray(result?.items) ? result.items : [];
    if (!source || !rawItems.length || !source.asOf) return { ready: false };
    const rows = rawItems.map(projectItem);
    if (rows.some(row => !row)) return { ready: false };
    const policyVersions = source.policyVersions?.filter(value => typeof value === 'string' && value);
    if (policyVersions?.length !== 1 || rawItems.some(row => row.policyVersion !== policyVersions[0])) {
      return { ready: false };
    }
    const asOf = new Date(source.asOf);
    if (!Number.isFinite(asOf.getTime())) return { ready: false };
    const hasMore = rows.length > normalized.limit;
    const page = rows.slice(0, normalized.limit);
    const last = page.at(-1);
    const snapshotAsOf = asOf;
    return {
      ready: true, scope, sourceVersion: sourceVersion(snapshotAsOf), asOf: snapshotAsOf.toISOString(),
      policyVersion: policyVersions[0], decisionIds: [], metrics: [],
      items: page.map(({ submittedAt: _submittedAt, updatedAt: _updatedAt,
        sitterUpdatedAt: _sitterUpdatedAt, policyVersion: _policyVersion,
        decisionVersion: _decisionVersion, ...item }) => item),
      nextCursor: hasMore ? encodeCursor(last, scope, normalized, cursorSecret) : null
    };
  }

  return Object.freeze({ readSnapshot });
}

export function createMongoDashboardRepositories({ connection, cursorSecret } = {}) {
  if (!connection?.collection || !validSecret(cursorSecret)) return Object.freeze({});
  return Object.freeze({ payroll: createMongoPayrollRepository({ connection, cursorSecret }) });
}
