import { createHash, createHmac, randomUUID } from 'node:crypto';
import { settlementModels, settlementBucketNames } from '../../models/settlement.model.js';
import { AppError } from '../../utils/app-error.js';

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
function earningBucketsReady(row) {
  return Object.values(BUCKET_TO_FIELD).every(field => safeAmount(row[field]));
}
function hasEarningBalance(row) {
  return settlementBucketNames.some(bucket => row[BUCKET_TO_FIELD[bucket]] > 0);
}
function requestView(row) {
  const source = plain(row);
  if (!source) return null;
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
  const submittedAt = new Date(parsed?.submittedAt);
  if (!Number.isFinite(submittedAt.getTime())) return null;
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

export function createMongoSettlementRepository({ connection, models = settlementModels(connection), cursorSecret,
  privateEvidence } = {}) {
  if (!connection || !models) throw new TypeError('Settlement database dependencies are required');
  const {
    SettlementRequest: requests, SettlementWeekClaim: claims, Earning: earnings,
    FinancialLock: locks, EarningLedgerEntry: ledger, SettlementCommand: commands,
    SettlementEvent: events, SettlementOutbox: outbox, SettlementTransfer: transfers,
    SettlementTransferClaim: transferClaims,
    SettlementEvidence: evidence, EarningAdjustment: adjustments
  } = models;

  async function assertIndexesReady() {
    for (const model of Object.values(models)) {
      const required = model.schema.indexes().filter(([, config]) => config.unique);
      if (!required.length) continue;
      let actual;
      try { actual = await model.collection.listIndexes().toArray(); }
      catch (error) {
        if (error.code !== 26) throw error;
        throw new AppError(503, 'SETTLEMENT_STORAGE_NOT_READY', 'Settlement indexes must be provisioned');
      }
      if (required.some(([keys, config]) => !actual.some(index => index.unique === true
        && JSON.stringify(index.key) === JSON.stringify(keys)
        && JSON.stringify(index.partialFilterExpression) === JSON.stringify(config.partialFilterExpression)))) {
        throw new AppError(503, 'SETTLEMENT_STORAGE_NOT_READY', 'Settlement indexes must be provisioned');
      }
    }
  }

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

  async function earningLedgerReady(row, session) {
    if (!earningBucketsReady(row) || !safeAmount(row.accruedVnd)) return false;
    const lines = await queryWithSession(ledger.find({ earningId: row.earningId, sitterId: row.sitterId }), session).lean().exec();
    const totals = Object.fromEntries(settlementBucketNames.map(bucket => [bucket, 0]));
    if (!lines.length) return false;
    for (const line of lines) {
      if (!safeAmount(line.amountVnd) || !settlementBucketNames.includes(line.toBucket)
        || (line.fromBucket && !settlementBucketNames.includes(line.fromBucket))) return false;
      if (line.fromBucket) totals[line.fromBucket] -= line.amountVnd;
      totals[line.toBucket] += line.amountVnd;
    }
    return settlementBucketNames.every(bucket => totals[bucket] === row[BUCKET_TO_FIELD[bucket]])
      && settlementBucketNames.reduce((sum, bucket) => sum + totals[bucket], 0) === row.accruedVnd;
  }

  async function reserveEarnings({ sitterId, earningIds, requestId, policyVersion, decisionVersion }, session) {
    const rows = await queryWithSession(earnings.find({ earningId: { $in: earningIds }, sitterId }), session).lean().exec();
    if (rows.length !== earningIds.length || rows.some(row => row.state !== 'AVAILABLE'
      || !safeAmount(row.availableVnd) || row.availableVnd <= 0 || row.reservedVnd !== 0)) return null;
    for (const row of rows) {
      if (await activeLockForEarning(row, requestId, session) || !await earningLedgerReady(row, session)) return null;
    }
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
        amountVnd: amount, policyVersion, decisionVersion, actorId: sitterId, occurredAt: now
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

  async function readOwn(input, session) {
    if (!session && typeof connection.transaction === 'function') {
      return connection.transaction(transaction => readOwn(input, transaction), {
        readPreference: 'primary', readConcern: { level: 'snapshot' }
      });
    }
    const { sitterId, requestWeekKey } = input;
    // Until the paged historical projection is available, refuse oversized
    // histories explicitly. Never truncate rows and present partial totals.
    const earningRows = await queryWithSession(earnings.find({ sitterId }), session)
      .sort({ earningPeriodKey: -1, earningId: 1 }).limit(1001).lean().exec();
    const ledgerRows = await queryWithSession(ledger.find({ sitterId }), session)
      .sort({ occurredAt: 1, lineId: 1 }).limit(10001).lean().exec();
    const requestRows = await queryWithSession(requests.find({ sitterId }), session)
      .sort({ submittedAt: -1, id: -1 }).limit(1001).lean().exec();
    if (earningRows.length > 1000 || ledgerRows.length > 10000 || requestRows.length > 1000) {
      throw new AppError(503, 'SETTLEMENT_HISTORY_LIMIT', 'Settlement history requires a paged projection');
    }
    // A sitter read must expose every real bucket (pending/held/reserved/paid as
    // well as available). Invalid persisted money is an unavailable projection,
    // never a reason to silently omit an earning or replace it with zeroes.
    if (earningRows.some(row => !earningBucketsReady(row))) return { ledgerReady: false };
    const totals = Object.fromEntries(settlementBucketNames.map(bucket => [bucket, 0]));
    const byEarning = new Map(earningRows.map(row => [row.earningId,
      Object.fromEntries(settlementBucketNames.map(bucket => [bucket, 0]))]));
    for (const line of ledgerRows) {
      const buckets = byEarning.get(line.earningId);
      if (!buckets || !safeAmount(line.amountVnd) || !settlementBucketNames.includes(line.toBucket)
        || (line.fromBucket && !settlementBucketNames.includes(line.fromBucket))) return { ledgerReady: false };
      if (line.fromBucket) { totals[line.fromBucket] -= line.amountVnd; buckets[line.fromBucket] -= line.amountVnd; }
      totals[line.toBucket] += line.amountVnd;
      buckets[line.toBucket] += line.amountVnd;
    }
    if (earningRows.some(row => settlementBucketNames.some(bucket =>
      byEarning.get(row.earningId)[bucket] !== row[BUCKET_TO_FIELD[bucket]])
      || !safeAmount(row.accruedVnd)
      || settlementBucketNames.reduce((sum, bucket) => sum + row[BUCKET_TO_FIELD[bucket]], 0) !== row.accruedVnd)) {
      return { ledgerReady: false };
    }
    const ledgerReady = earningRows.length === 0 || ledgerRows.length > 0;
    if (Object.values(totals).some(value => !Number.isSafeInteger(value) || value < 0)) return { ledgerReady: false };
    const claim = await queryWithSession(claims.findOne({ sitterId, requestWeekKey }), session).lean().exec();
    return {
      ledgerReady,
      balances: { accrued: settlementBucketNames.reduce((sum, bucket) => sum + totals[bucket], 0),
        pending: totals.PENDING, held: totals.HELD, available: totals.AVAILABLE,
        reserved: totals.RESERVED, paid: totals.PAID },
      earnings: earningRows.map(mapEarning).filter(hasEarningBalance),
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
    if (!session) throw new TypeError('Reservation readiness requires a transaction');
    const rows = await reservationRows(requestId, session);
    if (!rows.length || rows.some(row => !safeAmount(row.reservedVnd) || row.reservedVnd <= 0)) return false;
    const total = rows.reduce((sum, row) => sum + row.reservedVnd, 0);
    if (total !== amountVnd) return false;
    for (const row of rows) {
      if (await activeLockForEarning(row, requestId, session) || !await earningLedgerReady(row, session)) return false;
      // Approval also needs a shared write, even though it keeps bucket amounts
      // unchanged. A read-only check plus request CAS races a new case/refund lock.
      const touched = await earnings.updateOne({ earningId: row.earningId, version: row.version,
        state: 'RESERVED', 'reservation.requestId': requestId },
      { $inc: { version: 1 } }, options(session));
      if (touched.matchedCount !== 1) return false;
    }
    return true;
  }

  async function releaseReservation({ requestId, expectedStatus, amountVnd, actorId, policyVersion, decisionVersion }, session) {
    if (await queryWithSession(transfers.findOne({ requestId }), session).lean().exec()) return false;
    const rows = await reservationRows(requestId, session);
    if (!rows.length || rows.reduce((sum, row) => sum + row.reservedVnd, 0) !== amountVnd) return false;
    for (const row of rows) if (!await earningLedgerReady(row, session)) return false;
    const now = new Date();
    for (const row of rows) {
      const held = Boolean(await activeLockForEarning(row, requestId, session));
      const target = held ? 'HELD' : 'AVAILABLE';
      const field = BUCKET_TO_FIELD[target];
      const updated = await queryWithSession(earnings.findOneAndUpdate({ earningId: row.earningId,
        state: 'RESERVED', 'reservation.requestId': requestId, reservedVnd: row.reservedVnd },
      { $inc: { reservedVnd: -row.reservedVnd, [field]: row.reservedVnd, version: 1 },
        $set: { state: target, reservation: { requestId: null, reservedAt: null } } },
      { ...options(session), returnDocument: 'after', runValidators: true }), session).lean().exec();
      if (!updated) return false;
      await ledger.create([{
        lineId: `settlement:${requestId}:release:${row.earningId}`, operationId: `settlement:${requestId}:release`,
        requestId, earningId: row.earningId, sitterId: row.sitterId, fromBucket: 'RESERVED', toBucket: target,
        amountVnd: row.reservedVnd, actorId, policyVersion, decisionVersion, occurredAt: now
      }], options(session));
    }
    // The status is checked here as well as in the service so a stale adapter cannot release an approved request.
    const request = await queryWithSession(requests.findOne({ id: requestId, status: expectedStatus }), session).lean().exec();
    return Boolean(request);
  }

  async function assertEvidenceOwnership({ evidenceReference, requestId, actorId }, session) {
    const row = await queryWithSession(evidence.findOne({ evidenceReference, requestId, ownerActorId: actorId, state: 'UPLOADED' }), session).lean().exec();
    if (privateEvidence) {
      const image = await privateEvidence.findReady({ evidenceReference, actorId, requestId, session });
      if (!image) return false;
      if (row) return row.mediaId === image.mediaId;
      const existing = await evidence.findOne({ evidenceReference }).session(session).lean();
      if (existing) return false;
      await registerEvidence({ requestId, ownerActorId: actorId, evidenceReference,
        mediaId: image.mediaId, uploadedAt: image.uploadedAt }, session);
      return true;
    }
    return Boolean(row);
  }

  async function recordTransferAttempt({ requestId, version, adminId, outcome, reference,
    evidenceReference, amountVnd, paidAt }, session) {
    if (!(await assertEvidenceOwnership({ evidenceReference, requestId, actorId: adminId }, session))) return false;
    try {
      for (const [kind, value] of [['TRANSFER', reference], ['EVIDENCE', evidenceReference]]) {
        const claim = await transferClaims.findOneAndUpdate({ kind, reference: value },
          { $setOnInsert: { kind, reference: value, requestId } },
          { ...options(session), upsert: true, returnDocument: 'after', runValidators: true }).lean().exec();
        if (claim.requestId !== requestId) return false;
      }
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
    adminId, version, paidAt, policyVersion, decisionVersion }, session) {
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
        amountVnd: row.reservedVnd, actorId: adminId, policyVersion, decisionVersion, occurredAt: now
      }], options(session));
    }
    return true;
  }

  async function listPayroll({ cursor, limit = 50 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Settlement page limit is invalid');
    const decoded = cursor ? decodeCursor(cursor, cursorSecret) : null;
    if (cursor && !decoded) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid settlement cursor');
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
    if (!session) throw new TypeError('Financial locks require a transaction');
    // Lock producers and reservation writers must touch the same earning. A
    // separate FinancialLock insert alone permits write skew under snapshots.
    const target = resourceType === 'EARNING' ? { earningId } : { visitId: earningId };
    const existing = await locks.findOne({ resourceType, resourceId: earningId, lockType, reference }).session(session).lean();
    if (existing) return existing;
    const touched = await earnings.updateMany(target, { $inc: { version: 1 } }, options(session));
    if (!touched.matchedCount) throw new TypeError('Financial lock has no earning');
    const now = new Date();
    const rows = await earnings.find({ ...target, state: 'AVAILABLE' }).session(session).lean();
    if (['CASE', 'REFUND', 'HOLD'].includes(lockType)) {
      const paidRows = await earnings.find({ ...target, paidVnd: { $gt: 0 } }).session(session).lean();
      for (const row of paidRows) {
        const id = createHash('sha256').update(JSON.stringify([row.earningId, lockType, reference])).digest('hex');
        await adjustments.create([{ id, earningId: row.earningId, sitterId: row.sitterId,
          sourceReference: reference, sourceType: lockType, status: 'PENDING_ADMIN_REVIEW',
          proposedAmountVnd: null, createdBy: actorId, createdAt: now }], options(session));
      }
    }
    for (const row of rows) {
      if (!await earningLedgerReady(row, session)) throw new AppError(409, 'LEDGER_UNAVAILABLE', 'Invalid earning ledger');
      await earnings.updateOne({ earningId: row.earningId, version: row.version },
        { $inc: { availableVnd: -row.availableVnd, heldVnd: row.availableVnd, version: 1 },
          $set: { state: 'HELD' } }, options(session));
      const digest = createHash('sha256').update(JSON.stringify([row.earningId, lockType, reference])).digest('hex');
      await ledger.create([{ lineId: `hold:${digest}`, operationId: `hold:${digest}`,
        earningId: row.earningId, sitterId: row.sitterId, fromBucket: 'AVAILABLE', toBucket: 'HELD',
        amountVnd: row.availableVnd, actorId, occurredAt: now }], options(session));
    }
    return locks.create([{ resourceType, resourceId: earningId, lockType, reference, actorId,
      state: 'ACTIVE', createdAt: now, releasedAt: null }], options(session));
  }

  async function unlockEarning({ earningId, lockType, reference, actorId, resourceType = 'EARNING' }, session) {
    if (!session || typeof actorId !== 'string' || !actorId) throw new TypeError('Audited transaction required for hold release');
    const target = resourceType === 'EARNING' ? { earningId } : { visitId: earningId };
    // Release and reservation/transfer writers serialize on the same earning.
    await earnings.updateMany(target, { $inc: { version: 1 } }, options(session));
    const now = new Date();
    const updated = await queryWithSession(locks.findOneAndUpdate({ resourceType, resourceId: earningId,
      lockType, reference, state: 'ACTIVE' }, { $set: { state: 'RELEASED', releasedAt: now, releasedBy: actorId } },
    { ...options(session), returnDocument: 'after' }), session).lean().exec();
    if (!updated) return false;
    const rows = await earnings.find({ ...target, state: 'HELD' }).session(session).lean();
    for (const row of rows) {
      if (await activeLockForEarning(row, null, session)) continue;
      if (!await earningLedgerReady(row, session)) throw new AppError(409, 'LEDGER_UNAVAILABLE', 'Invalid earning ledger');
      await earnings.updateOne({ earningId: row.earningId, version: row.version },
        { $inc: { heldVnd: -row.heldVnd, availableVnd: row.heldVnd, version: 1 },
          $set: { state: 'AVAILABLE' } }, options(session));
      const digest = createHash('sha256').update(JSON.stringify([row.earningId, lockType, reference])).digest('hex');
      await ledger.create([{ lineId: `release-hold:${digest}`, operationId: `release-hold:${digest}`,
        earningId: row.earningId, sitterId: row.sitterId, fromBucket: 'HELD', toBucket: 'AVAILABLE',
        amountVnd: row.heldVnd, actorId, occurredAt: now }], options(session));
    }
    return Boolean(updated);
  }

  return Object.freeze({ assertIndexesReady, findCommand, saveCommand, claimWeek, reserveEarnings, create, appendEvent,
    readOwn, getById, compareAndSet, assertReservationReady, releaseReservation,
    assertEvidenceOwnership, recordTransferAttempt, settleReservation, listPayroll,
    registerEvidence, lockEarning, unlockEarning });
}
