import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { settlementModels } from '../../models/settlement.model.js';
import { earningAccrualModels } from '../../models/earning-accrual.model.js';
import { AppError } from '../../utils/app-error.js';

const fields = { PENDING: 'pendingVnd', HELD: 'heldVnd', AVAILABLE: 'availableVnd',
  RESERVED: 'reservedVnd', PAID: 'paidVnd' };
const money = value => Number.isSafeInteger(value) && value >= 0;
function invalidCursor() { throw new AppError(422, 'VALIDATION_FAILED', 'Invalid earnings cursor'); }
function invalidProjection() { throw new AppError(503, 'INVALID_PROJECTION', 'Earning ledger is inconsistent'); }
function context(scope, query) {
  return createHash('sha256').update(JSON.stringify([scope.kind, scope.userId, scope.targetId,
    query.from ?? null, query.to ?? null, query.limit])).digest('base64url');
}
function signature(payload, secret) {
  return createHmac('sha256', secret).update(`earnings-v1:${payload}`).digest('base64url');
}
function encode(row, scope, query, secret) {
  const payload = Buffer.from(JSON.stringify([row.completedAt.toISOString(), row.earningId,
    context(scope, query)])).toString('base64url');
  return Buffer.from(JSON.stringify([payload, signature(payload, secret)])).toString('base64url');
}
function decode(token, scope, query, secret) {
  if (typeof token !== 'string' || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) invalidCursor();
  try {
    const [payload, supplied] = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const expected = Buffer.from(signature(payload, secret));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) invalidCursor();
    const [instant, id, fingerprint] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (fingerprint !== context(scope, query) || typeof id !== 'string' || id.length > 128
      || !Number.isFinite(Date.parse(instant))) invalidCursor();
    return { completedAt: new Date(instant), earningId: id };
  } catch { invalidCursor(); }
}

export function createMongoEarningsRepository({ connection, cursorSecret } = {}) {
  if (typeof connection?.transaction !== 'function' || typeof cursorSecret !== 'string'
    || Buffer.byteLength(cursorSecret) < 32) throw new TypeError('Snapshot database and cursor secret required');
  const { Earning: earnings, EarningLedgerEntry: ledger } = settlementModels(connection);
  const { BookingEarningSnapshot: snapshots } = earningAccrualModels(connection);

  async function readSnapshot({ scope, query }) {
    if (scope?.kind !== 'earnings' || !scope.userId || scope.targetId !== scope.userId) return { ready: false };
    if (!Number.isSafeInteger(query?.limit) || query.limit < 1 || query.limit > 50 || query.search) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Invalid earnings filters');
    }
    const match = { sitterId: scope.userId };
    if (query.from || query.to) {
      match.completedAt = {};
      if (query.from) match.completedAt.$gte = new Date(`${query.from}T00:00:00+07:00`);
      if (query.to) match.completedAt.$lt = new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + 86400000);
    }
    if (query.cursor) {
      const last = decode(query.cursor, scope, query, cursorSecret);
      match.$or = [{ completedAt: { $lt: last.completedAt } },
        { completedAt: last.completedAt, earningId: { $lt: last.earningId } }];
    }
    return connection.transaction(async session => {
      const rows = await earnings.find(match).sort({ completedAt: -1, earningId: -1 })
        .limit(query.limit + 1).session(session).lean();
      if (!rows.length) return { ready: false };
      const page = rows.slice(0, query.limit);
      const ids = page.map(row => row.earningId);
      const sources = await snapshots.find({ id: { $in: page.map(row => row.sourceSnapshotId) },
        sitterId: scope.userId }).limit(50).session(session).lean();
      const lines = await ledger.find({ sitterId: scope.userId, earningId: { $in: ids } })
        .limit(10001).session(session).lean();
      if (lines.length > 10000) throw new AppError(503, 'EARNING_HISTORY_LIMIT', 'Paged ledger projection required');
      const policyVersions = new Set(sources.map(source => source.policyVersion));
      if (sources.length !== page.length || policyVersions.size !== 1) return { ready: false };
      const items = [];
      let asOf = 0;
      for (const row of page) {
        const source = sources.find(snapshot => snapshot.id === row.sourceSnapshotId);
        if (!source || source.bookingId !== row.bookingId || source.accruedVnd !== row.accruedVnd
          || source.completedAt.getTime() !== row.completedAt?.getTime()
          || !source.decisionVersion || !source.completionReference || !source.assessmentReference
          || !source.paymentReference || !source.allocationReference) return { ready: false };
        const balances = Object.fromEntries(Object.keys(fields).map(bucket => [bucket, 0n]));
        const principal = lines.filter(line => line.earningId === row.earningId);
        if (!principal.length) invalidProjection();
        for (const line of principal) {
          if (!money(line.amountVnd) || !Object.hasOwn(fields, line.toBucket)
            || (line.fromBucket && !Object.hasOwn(fields, line.fromBucket))) invalidProjection();
          if (line.fromBucket) balances[line.fromBucket] -= BigInt(line.amountVnd);
          balances[line.toBucket] += BigInt(line.amountVnd);
        }
        if (!money(row.accruedVnd) || Object.entries(fields).some(([bucket, field]) =>
          !money(row[field]) || balances[bucket] !== BigInt(row[field]))
          || Object.values(balances).reduce((sum, value) => sum + value, 0n) !== BigInt(row.accruedVnd)) {
          invalidProjection();
        }
        const item = { id: row.earningId, sitterId: row.sitterId, bookingId: row.bookingId,
          bookingState: 'COMPLETED', completedAt: row.completedAt.toISOString(),
          accrued: row.accruedVnd, pending: row.pendingVnd, held: row.heldVnd,
          available: row.availableVnd, reserved: row.reservedVnd, paid: row.paidVnd,
          explanation: row.explanation, ledgerReference: row.ledgerReference,
          transferRecordedAt: row.transferRecordedAt?.toISOString() ?? null };
        items.push(item);
        asOf = Math.max(asOf, row.updatedAt.getTime(), source.createdAt.getTime());
      }
      const timestamp = new Date(asOf).toISOString();
      return { ready: true, scope, items, asOf: timestamp, sourceVersion: `earning-snapshot/${timestamp}`,
        policyVersion: [...policyVersions][0], decisionIds: [],
        nextCursor: rows.length > query.limit ? encode(page.at(-1), scope, query, cursorSecret) : null };
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' } });
  }
  return Object.freeze({ readSnapshot });
}
