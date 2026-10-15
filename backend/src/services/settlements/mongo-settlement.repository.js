import { createHmac, randomUUID } from 'node:crypto';
import { settlementModels, settlementBucketNames } from '../../models/settlement.model.js';

const BUCKET_TO_FIELD = Object.freeze({
  PENDING: 'pendingVnd', HELD: 'heldVnd', AVAILABLE: 'availableVnd',
  RESERVED: 'reservedVnd', PAID: 'paidVnd'
});

function options(session) { return session ? { session } : {}; }
function queryWithSession(query, session) { return session ? query.session(session) : query; }
function plain(value) { return value?.toObject ? value.toObject() : value; }
function asDate(value, field = 'date') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`Invalid ${field}`);
  return date;
}
function safeAmount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function requestView(row) {
  const source = plain(row);
  return { ...source, id: source.id, submittedAt: source.submittedAt instanceof Date
    ? source.submittedAt.toISOString() : source.submittedAt };
}
function cursorDigest(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
function encodeCursor(row, secret) {
  const payload = Buffer.from(JSON.stringify({ submittedAt: new Date(row.submittedAt).toISOString(), id: row.id })).toString('base64url');
  return secret ? `${payload}.${cursorDigest(payload, secret)}` : payload;
}
function decodeCursor(value, secret) {
  if (typeof value !== 'string' || value.length > 512) return null;
  const [payload, signature] = value.split('.');
  if (!payload || (secret && signature !== cursorDigest(payload, secret))) return null;
  if (secret && !signature) return null;
  let parsed;
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  const submittedAt = asDate(parsed?.submittedAt, 'cursor');
  if (typeof parsed?.id !== 'string' || !parsed.id || parsed.id.length > 128) return null;
  return { submittedAt, id: parsed.id };
}

function eventPayload(event) {
  return {
    eventId: event.eventId ?? randomUUID(), operationId: event.operationId,
    requestId: event.requestId, type: event.type, actorId: event.actorId ?? null,
    earningIds: event.earningIds, amountVnd: event.amountVnd ?? null,
    fromBucket: event.fromBucket ?? null, toBucket: event.toBucket ?? null,
    reason: event.reason ?? null, transfer: event.transfer ?? null,
    policyVersion: event.policyVersion ?? null, decisionVersion: event.decisionVersion ?? null,
    aggregateVersion: event.aggregateVersion ?? null, occurredAt: asDate(event.occurredAt, 'occurredAt')
  };
}

function mapEarning(row) {
  const source = plain(row);
  return {
    id: source.earningId, earningId: source.earningId, sitterId: source.sitterId,
    visitId: source.visitId ?? null, earningPeriodKey: source.earningPeriodKey,
    accruedVnd: source.accruedVnd, pendingVnd: source.pendingVnd,
    heldVnd: source.heldVnd, availableVnd: source.availableVnd,
    reservedVnd: source.reservedVnd, paidVnd: source.paidVnd,
    explanation: source.explanation ?? null, ledgerReference: source.ledgerReference ?? null,
    transferRecordedAt: source.transferRecordedAt ? new Date(source.transferRecordedAt).toISOString() : null
  };
}

export function createMongoSettlementRepository({ connection, models = settlementModels(connection), cursorSecret } = {}) {
  if (!connection || !models) throw new TypeError('Settlement database dependencies are required');
  const {
    SettlementRequest: requests, SettlementWeekClaim: claims, Earning: earnings,
    FinancialLock: locks, EarningLedgerEntry: ledger, SettlementCommand: commands,
    SettlementEvent: events, SettlementOutbox: outbox, SettlementTransfer: transfers,
    SettlementEvidence: evidence
  } = models;

  async function findCommand(scope, session) {
    return plain(await queryWithSession(commands.findOne({ actorId: scope.actorId,
      operation: scope.operation, key: scope.key }), session).lean().exec());
  }

  async function saveCommand(command, session) {
    const row = { actorId: command.actorId, operation: command.operation, key: command.key,
      fingerprint: command.fingerprint, result: command.result, createdAt: asDate(command.createdAt ?? new Date(), 'createdAt') };
    await commands.create([row], options(session));
    return row;
  }

  async function claimWeek({ sitterId, requestWeekKey, startsAt, endsAt }, session) {
    const id = randomUUID();
    const result = await claims.updateOne({ sitterId, requestWeekKey }, {
      $setOnInsert: { id, sitterId, requestWeekKey, startsAt: asDate(startsAt, 'startsAt'), endsAt: asDate(endsAt, 'endsAt') }
    }, { ...options(session), upsert: true });
    if (result.upsertedCount !== 1) return null;
    return { id, sitterId, requestWeekKey, startsAt, endsAt };
  }

  async function activeLockForEarning(earning, requestId, session) {
    const ids = [earning.earningId];
    if (earning.visitId) ids.push(earning.visitId);
    const query = { state: 'ACTIVE', $or: [
      { resourceType: 'EARNING', resourceId: { $in: ids } },
      { resourceType: 'ALLOCATION', resourceId: { $in: ids } }
    ], $and: [{ $or: [{ lockType: { $ne: 'SETTLEMENT' } }, { reference: { $ne: requestId } }] }] };
    return queryWithSession(locks.findOne(query), session).lean().exec();
  }

  async function appendOriginLines(rows, session) {
    const lineRows = [];
    for (const row of rows) {
      const existing = await queryWithSession(ledger.findOne({ earningId: row.earningId }), session).lean().exec();
      if (existing) continue;
      for (const bucket of settlementBucketNames) {
        const amount = row[BUCKET_TO_FIELD[bucket]];
        if (!amount) continue;
        lineRows.push({ lineId: `earning:${row.earningId}:origin:${bucket}`,
          operationId: `earning:${row.earningId}:origin`, requestId: null,
          earningId: row.earningId, sitterId: row.sitterId, fromBucket: null,
          toBucket: bucket, amountVnd: amount, occurredAt: asDate(row.createdAt ?? new Date(), 'createdAt') });
      }
    }
    if (lineRows.length) await ledger.create(lineRows, options(session));
  }

  async function reserveEarnings({ sitterId, earningIds, requestId, policyVersion, decisionVersion }, session) {
    const rows = await queryWithSession(earnings.find({ earningId: { $in: earningIds }, sitterId }), session).lean().exec();
    if (rows.length !== earningIds.length || rows.some(row => row.state !== 'AVAILABLE'
      || !safeAmount(row.availableVnd) || row.availableVnd <= 0 || row.reservedVnd !== 0)) return null;
    for (const row of rows) if (await activeLockForEarning(row, requestId, session)) return null;
    await appendOriginLines(rows, session);
    const now = new Date();
    const snapshots = [];
    let amountVnd = 0;
    for (const row of rows) {
      const amount = row.availableVnd;
      const updated = await queryWithSession(earnings.findOneAndUpdate({ earningId: row.earningId,
        sitterId, state: 'AVAILABLE', availableVnd: amount, reservedVnd: 0,
        'reservation.requestId': null }, { $inc: { availableVnd: -amount, reservedVnd: amount, version: 1 },
        $set: { state: 'RESERVED', reservation: { requestId, reservedAt: now } } },
      { ...options(session), returnDocument: 'after', runValidators: true }), session).lean().exec();
      if (!updated) return null;
      amountVnd += amount;
      snapshots.push({ earningId: updated.earningId, visitId: updated.visitId ?? null,
        earningPeriodKey: updated.earningPeriodKey, amountVnd: amount,
        pendingVnd: updated.pendingVnd, heldVnd: updated.heldVnd,
        availableVnd: updated.availableVnd, reservedVnd: updated.reservedVnd,
        paidVnd: updated.paidVnd, explanation: updated.explanation ?? null,
        ledgerReference: updated.ledgerReference ?? null,
        transferRecordedAt: updated.transferRecordedAt ?? null });
      await ledger.create([{
        lineId: `settlement:${requestId}:reserve:${row.earningId}`, operationId: `settlement:${requestId}:reserve`,
        requestId, earningId: row.earningId, sitterId, fromBucket: 'AVAILABLE', toBucket: 'RESERVED',
        amountVnd: amount, policyVersion, decisionVersion, occurredAt: now
      }], options(session));
    }
    return { amountVnd, earnings: snapshots };
  }

  async function create(row, session) {
    const [created] = await requests.create([{
      ...row, startsAt: asDate(row.startsAt, 'startsAt'), endsAt: asDate(row.endsAt, 'endsAt'),
      submittedAt: asDate(row.submittedAt, 'submittedAt')
    }], options(session));
    return requestView(created);
  }

  async function appendEvent(event, session) {
    const payload = eventPayload(event);
    await events.create([payload], options(session));
    await outbox.create([{
      eventId: payload.eventId, operationId: payload.operationId, requestId: payload.requestId,
      type: payload.type, payload, state: 'PENDING', attempts: 0, createdAt: payload.occurredAt
    }], options(session));
    return payload;
  }

  async function readOwn({ sitterId, requestWeekKey }) {
    const earningRows = await earnings.find({ sitterId }).sort({ earningPeriodKey: -1, earningId: 1 }).lean().exec();
    const ledgerRows = await ledger.find({ sitterId }).sort({ occurredAt: 1, lineId: 1 }).lean().exec();
    const totals = Object.fromEntries(settlementBucketNames.map(bucket => [bucket, 0]));
    for (const line of ledgerRows) {
      if (!safeAmount(line.amountVnd) || !settlementBucketNames.includes(line.toBucket)) return { ledgerReady: false };
      if (line.fromBucket) totals[line.fromBucket] -= line.amountVnd;
      totals[line.toBucket] += line.amountVnd;
    }
    const ledgerReady = earningRows.length === 0 || ledgerRows.length > 0;
    if (Object.values(totals).some(value => !Number.isSafeInteger(value) || value < 0)) return { ledgerReady: false };
    const claim = await claims.findOne({ sitterId, requestWeekKey }).lean().exec();
    const requestRows = await requests.find({ sitterId }).sort({ submittedAt: -1, id: -1 }).lean().exec();
    return {
      ledgerReady,
      balances: { accrued: settlementBucketNames.reduce((sum, bucket) => sum + totals[bucket], 0),
        pending: totals.PENDING, held: totals.HELD, available: totals.AVAILABLE,
        reserved: totals.RESERVED, paid: totals.PAID },
      earnings: earningRows.map(mapEarning).filter(row => row.availableVnd > 0),
      requests: requestRows.map(requestView), quotaUsed: Boolean(claim), decisionIds: []
    };
  }

  async function getById(id, session) {
    return requestView(await queryWithSession(requests.findOne({ id }), session).lean().exec());
  }

  async function compareAndSet(id, expectedVersion, patch, session) {
    const updated = await queryWithSession(requests.findOneAndUpdate({ id, version: expectedVersion },
      { $set: patch }, { ...options(session), returnDocument: 'after', runValidators: true }), session).lean().exec();
    return updated ? requestView(updated) : null;
  }

  async function reservationRows(requestId, session) {
    return queryWithSession(earnings.find({ 'reservation.requestId': requestId, state: 'RESERVED' }), session).lean().exec();
  }

  async function assertReservationReady({ requestId, amountVnd }, session) {
    const rows = await reservationRows(requestId, session);
    if (!rows.length || rows.some(row => !safeAmount(row.reservedVnd) || row.reservedVnd <= 0)) return false;
    const total = rows.reduce((sum, row) => sum + row.reservedVnd, 0);
    if (total !== amountVnd) return false;
    for (const row of rows) if (await activeLockForEarning(row, requestId, session)) return false;
    return true;
  }

  async function releaseReservation({ requestId, expectedStatus, amountVnd }, session) {
    if (await queryWithSession(transfers.findOne({ requestId }), session).lean().exec()) return false;
    const rows = await reservationRows(requestId, session);
    if (!rows.length || rows.reduce((sum, row) => sum + row.reservedVnd, 0) !== amountVnd) return false;
    const now = new Date();
    for (const row of rows) {
      const updated = await queryWithSession(earnings.findOneAndUpdate({ earningId: row.earningId,
        state: 'RESERVED', 'reservation.requestId': requestId, reservedVnd: row.reservedVnd },
      { $inc: { reservedVnd: -row.reservedVnd, availableVnd: row.reservedVnd, version: 1 },
        $set: { state: 'AVAILABLE', reservation: { requestId: null, reservedAt: null } } },
      { ...options(session), returnDocument: 'after', runValidators: true }), session).lean().exec();
      if (!updated) return false;
      await ledger.create([{
        lineId: `settlement:${requestId}:release:${row.earningId}`, operationId: `settlement:${requestId}:release`,
        requestId, earningId: row.earningId, sitterId: row.sitterId, fromBucket: 'RESERVED', toBucket: 'AVAILABLE',
        amountVnd: row.reservedVnd, occurredAt: now
      }], options(session));
    }
    // The status is checked here as well as in the service so a stale adapter cannot release an approved request.
    const request = await queryWithSession(requests.findOne({ id: requestId, status: expectedStatus }), session).lean().exec();
    return Boolean(request);
  }

  async function assertEvidenceOwnership({ evidenceReference, requestId, actorId }, session) {
    const row = await queryWithSession(evidence.findOne({ evidenceReference, requestId, ownerActorId: actorId, state: 'UPLOADED' }), session).lean().exec();
    return Boolean(row);
  }

  async function recordTransferAttempt({ requestId, version, adminId, outcome, reference,
    evidenceReference, amountVnd, paidAt }, session) {
    if (!(await assertEvidenceOwnership({ evidenceReference, requestId, actorId: adminId }, session))) return false;
    try {
      await transfers.create([{
        requestId, version, adminId, outcome, reference, evidenceReference,
        amountVnd: amountVnd ?? null, paidAt: paidAt ? asDate(paidAt, 'paidAt') : null, recordedAt: new Date()
      }], options(session));
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  async function settleReservation({ requestId, amountVnd, reference, evidenceReference,
    adminId, version, paidAt }, session) {
    if (!(await assertReservationReady({ requestId, amountVnd }, session))) return false;
    if (!(await recordTransferAttempt({ requestId, version, adminId, outcome: 'CONFIRMED', reference,
      evidenceReference, amountVnd, paidAt }, session))) return false;
    const rows = await reservationRows(requestId, session);
    const now = new Date();
    for (const row of rows) {
      const updated = await queryWithSession(earnings.findOneAndUpdate({ earningId: row.earningId,
        state: 'RESERVED', 'reservation.requestId': requestId, reservedVnd: row.reservedVnd },
      { $inc: { reservedVnd: -row.reservedVnd, paidVnd: row.reservedVnd, version: 1 },
        $set: { state: 'PAID', transferRecordedAt: paidAt ? asDate(paidAt, 'paidAt') : now,
          reservation: { requestId: null, reservedAt: null } } },
      { ...options(session), returnDocument: 'after', runValidators: true }), session).lean().exec();
      if (!updated) return false;
      await ledger.create([{
        lineId: `settlement:${requestId}:paid:${row.earningId}`, operationId: `settlement:${requestId}:paid`,
        requestId, earningId: row.earningId, sitterId: row.sitterId, fromBucket: 'RESERVED', toBucket: 'PAID',
        amountVnd: row.reservedVnd, actorId: adminId, occurredAt: now
      }], options(session));
    }
    return true;
  }

  async function listPayroll({ cursor, limit = 50 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Settlement page limit is invalid');
    const decoded = cursor ? decodeCursor(cursor, cursorSecret) : null;
    if (cursor && !decoded) throw new Error('Invalid settlement cursor');
    const query = decoded ? { $or: [{ submittedAt: { $lt: decoded.submittedAt } },
      { submittedAt: decoded.submittedAt, id: { $lt: decoded.id } }] } : {};
    const rows = await requests.find(query).sort({ submittedAt: -1, id: -1 }).limit(limit + 1).lean().exec();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(requestView);
    return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1], cursorSecret) : null, decisionIds: [] };
  }

  async function registerEvidence({ requestId, ownerActorId, evidenceReference, mediaId, uploadedAt = new Date() }, session) {
    return evidence.create([{
      requestId, ownerActorId, evidenceReference, mediaId, state: 'UPLOADED', uploadedAt: asDate(uploadedAt, 'uploadedAt')
    }], options(session));
  }

  async function lockEarning({ earningId, lockType, reference, actorId = null, resourceType = 'EARNING' }, session) {
    return locks.create([{ resourceType, resourceId: earningId, lockType, reference, actorId,
      state: 'ACTIVE', createdAt: new Date(), releasedAt: null }], options(session));
  }

  async function unlockEarning({ earningId, lockType, reference }, session) {
    const updated = await queryWithSession(locks.findOneAndUpdate({ resourceType: 'EARNING', resourceId: earningId,
      lockType, reference, state: 'ACTIVE' }, { $set: { state: 'RELEASED', releasedAt: new Date() } },
    { ...options(session), returnDocument: 'after' }), session).lean().exec();
    return Boolean(updated);
  }

  return Object.freeze({ findCommand, saveCommand, claimWeek, reserveEarnings, create, appendEvent,
    readOwn, getById, compareAndSet, assertReservationReady, releaseReservation,
    assertEvidenceOwnership, recordTransferAttempt, settleReservation, listPayroll,
    registerEvidence, lockEarning, unlockEarning });
}
