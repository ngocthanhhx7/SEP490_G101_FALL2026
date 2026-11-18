import { Types } from 'mongoose';
import { fail } from '../../validators/pet-care.validator.js';
import { visitBoardQuery, NEEDS_ACTION_REASONS } from '../../validators/needs-action.validator.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { AppError } from '../../utils/app-error.js';
import { hasPendingWithdrawal } from './visit-withdrawal.service.js';
import { visitNeedsCountStages, visitBoardPageStages } from './visit-board-query.service.js';

const MINUTE = 60000, HOUR = 60 * MINUTE;
export const NO_SITTER_WINDOW_MS = 24 * HOUR;
export const CHECK_IN_GRACE_MS = 30 * MINUTE;
export const CHECK_OUT_GRACE_MS = 2 * HOUR;
const PAGE_SIZE = 50, QUERY_MS = 5000;
const oid = value => new Types.ObjectId(value);
const reasonOf = (code, ms) => ({ code, late: ms < 0, ms: Math.abs(ms) });
const lateReason = (code, ms) => ({ code, late: true, ms });
const compareReasons = (a, b) => (a.late !== b.late ? (a.late ? -1 : 1)
  : (a.late ? b.ms - a.ms : a.ms - b.ms) || NEEDS_ACTION_REASONS.indexOf(a.code) - NEEDS_ACTION_REASONS.indexOf(b.code));

export function reasonsOfVisit(row, now) {
  const start = row.startAt.getTime(), end = row.endAt.getTime(), out = [];
  const noSitter = row.state === 'SCHEDULED' && !row.sitterId, code = row.dispatchReview?.code;
  if (noSitter && code && code !== 'SHIFT_START_REACHED') out.push(reasonOf('NO_SITTER_TO_OFFER', start - now));
  if (noSitter && start - now <= NO_SITTER_WINDOW_MS) out.push(reasonOf('NO_SITTER_24H', start - now));
  if (row.state === 'ASSIGNED' && !row.checkInAt && now >= start + CHECK_IN_GRACE_MS) out.push(lateReason('NOT_CHECKED_IN_30M', now - start));
  if (row.state === 'ASSIGNED' && !row.checkInAt && hasPendingWithdrawal(row)) out.push(reasonOf('WITHDRAWAL_UNDER_12H', start - now));
  if (row.state === 'IN_PROGRESS' && row.checkInAt instanceof Date && !row.checkOutAt && now >= end + CHECK_OUT_GRACE_MS)
    out.push(lateReason('NOT_CHECKED_OUT_2H', now - end));
  if (row.state === 'STAFF_CLOSED' && ['COMPLETION_VERIFICATION_PENDING', 'FINANCIAL_RECONCILIATION_REQUIRED'].includes(row.completionAttention?.code))
    out.push(lateReason(row.completionAttention.code, Math.max(0, now - end)));
  if (['ASSIGNED','IN_PROGRESS'].includes(row.state) && (row.workflowProgress?.blocked || row.incidentOpen)) out.push(lateReason('WORKFLOW_BLOCKED', Math.max(0, now - new Date(row.workflowProgress?.updatedAt ?? row.startAt).getTime())));
  return out.sort(compareReasons);
}

export function createNeedsActionService({ repository, clock = Date.now, cursorSecret }) {
  const { col } = repository;
  let cursors;
  const cursor = () => {
    try { return cursors ??= createScopedCursor({ secret: cursorSecret, namespace: 'visit-board-v2', clock }); }
    catch { throw new AppError(503, 'VISIT_BOARD_UNAVAILABLE', 'Cursor signing is not configured'); }
  };

  async function decorate(rows, now, needs) {
    const personIds = [...new Set(rows.flatMap(row => [row.customerId, row.sitterId]).filter(Boolean).map(String))].map(oid);
    const bookingIds = [...new Set(rows.map(row => String(row.bookingId)))].map(oid);
    const [users, bookings] = await Promise.all([
      personIds.length ? col('users').find({ _id: { $in: personIds } }, { projection: { displayName: 1 } }).limit(personIds.length).maxTimeMS(QUERY_MS).toArray() : [],
      bookingIds.length ? col('bookings').find({ _id: { $in: bookingIds } }, { projection: { bookingCode: 1, code: 1 } }).limit(bookingIds.length).maxTimeMS(QUERY_MS).toArray() : []
    ]);
    const names = new Map(users.map(row => [String(row._id), row.displayName]));
    const codes = new Map(bookings.map(row => [String(row._id), row.bookingCode ?? row.code ?? null]));
    return rows.map(row => ({ id: String(row._id), bookingId: String(row.bookingId), bookingCode: codes.get(String(row.bookingId)) ?? null,
      ...(row.workflowProgress ? { workflowProgress: row.workflowProgress } : {}), version: row.version, serviceName: row.snapshots?.serviceName ?? null, startAt: row.startAt, endAt: row.endAt,
      areaCode: row.areaCode ?? null, state: row.state, customerName: names.get(String(row.customerId)) ?? null,
      sitterId: row.sitterId ? String(row.sitterId) : null, sitterName: names.get(String(row.sitterId)) ?? null,
      reviewCode: row.dispatchReview?.code ?? null, ...(needs ? { reasons: reasonsOfVisit(row, now) } : {}) }));
  }

  return {
    async list(actor, rawQuery) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
      const query = visitBoardQuery(rawQuery), needs = query.tab === 'needs-action';
      const context = { actor: actor.userId, tab: query.tab, search: query.search ?? null, areaCode: query.areaCode ?? null, reason: query.reason ?? null };
      const position = query.cursor ? cursor().decode(query.cursor, context) : null;
      if (position && (!Number.isSafeInteger(position.a) || position.a < 0 || position.a > clock()
        || !Number.isSafeInteger(position.s) || !/^[a-f0-9]{24}$/u.test(position.i ?? '')
        || needs && (!Number.isSafeInteger(position.r) || position.r < 0 || position.r >= NEEDS_ACTION_REASONS.length || !Number.isSafeInteger(position.t))))
        fail('VALIDATION_FAILED', 'Invalid cursor');
      const now = position?.a ?? clock(), options = { maxTimeMS: QUERY_MS, allowDiskUse: false };
      // Queries are time-bounded, not silently truncated. Counts ignore list filters as before.
      let countRows, rows;
      try {
        [countRows, rows] = await Promise.all([
          col('visits').aggregate(visitNeedsCountStages(now), options).toArray(),
          col('visits').aggregate(visitBoardPageStages({ query, now, position, oid, limit: PAGE_SIZE }), options).toArray()
        ]);
      } catch (error) {
        if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') throw new AppError(503, 'VISIT_BOARD_TIMEOUT', 'Visit board query timed out; retry with a narrower filter');
        throw error;
      }
      const page = rows.slice(0, PAGE_SIZE), last = page.at(-1), hasMore = rows.length > PAGE_SIZE;
      const nextCursor = hasMore ? cursor().encode({ a: now, s: needs ? +last.__at : +last.startAt,
        ...(needs ? { r: last.__order, t: +last.startAt } : {}), i: String(last._id) }, context) : null;
      return { tab: query.tab, counts: { needsAction: countRows[0]?.total ?? 0, needsActionLimited: false },
        items: await decorate(page, now, needs), hasMore, nextCursor, limited: false, asOf: new Date(now) };
    }
  };
}
