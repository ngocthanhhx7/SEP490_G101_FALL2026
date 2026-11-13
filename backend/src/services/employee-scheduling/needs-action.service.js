import { Types } from 'mongoose';
import { fail } from '../../validators/pet-care.validator.js';
import { visitBoardQuery, NEEDS_ACTION_REASONS } from '../../validators/needs-action.validator.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { AppError } from '../../utils/app-error.js';
import { hasPendingWithdrawal } from './visit-withdrawal.service.js';

const MINUTE = 60 * 1000, HOUR = 60 * MINUTE;
// R3 10.1.1 thresholds.
export const NO_SITTER_WINDOW_MS = 24 * HOUR;
export const CHECK_IN_GRACE_MS = 30 * MINUTE;
export const CHECK_OUT_GRACE_MS = 2 * HOUR;
const CAP = 500;          // visits read per reason; the count shows "500+" when a reason reaches it
const PAGE_SIZE = 50;
const PEOPLE_LIMIT = 20;  // people matched by name in the All visits search
const VISIT_ID_LIMIT = 2000;
const QUERY_MS = 5000;
const oid = value => new Types.ObjectId(value);
const fold = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('vi');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const staffOnly = actor => {
  if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
};

const PROJECTION = { _id: 1, bookingId: 1, customerId: 1, sitterId: 1, state: 1, version: 1, startAt: 1, endAt: 1, areaCode: 1,
  checkInAt: 1, checkOutAt: 1, assignedAt: 1, withdrawalRequest: 1, 'dispatchReview.code': 1, 'snapshots.serviceName': 1 };
// Same booking conditions as the dispatch queue, so a visit shown here is one Staff can dispatch.
const BOOKING_STAGES = [
  { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } }, { $unwind: '$booking' },
  { $match: { 'booking.carePlanState': 'APPROVED', 'booking.state': { $in: ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
    $or: [{ 'booking.paymentMode': 'POSTPAY' }, { 'booking.paymentMode': 'PREPAY', 'booking.paymentState': 'PAID' }] } },
  { $unset: 'booking' }
];

const reasonOf = (code, remainingMs) => ({ code, late: remainingMs < 0, ms: Math.abs(remainingMs) });
const lateReason = (code, elapsedMs) => ({ code, late: true, ms: elapsedMs });
// Late reasons first, the longest late first; then the least time left; then the order of the R3 list.
const compareReasons = (a, b) => (a.late !== b.late ? (a.late ? -1 : 1)
  : (a.late ? b.ms - a.ms : a.ms - b.ms) || NEEDS_ACTION_REASONS.indexOf(a.code) - NEEDS_ACTION_REASONS.indexOf(b.code));

// All reasons that apply to a visit right now, most urgent first. Evaluated at read time because the sweep jobs have not run.
export function reasonsOfVisit(row, now) {
  const start = row.startAt.getTime(), end = row.endAt.getTime(), out = [];
  const noSitter = row.state === 'SCHEDULED' && !row.sitterId;
  const code = row.dispatchReview?.code;
  if (noSitter && code && code !== 'SHIFT_START_REACHED') out.push(reasonOf('NO_SITTER_TO_OFFER', start - now));
  if (noSitter && start - now <= NO_SITTER_WINDOW_MS) out.push(reasonOf('NO_SITTER_24H', start - now));
  if (row.state === 'ASSIGNED' && !row.checkInAt && now >= start + CHECK_IN_GRACE_MS) out.push(lateReason('NOT_CHECKED_IN_30M', now - start));
  if (row.state === 'ASSIGNED' && !row.checkInAt && hasPendingWithdrawal(row)) out.push(reasonOf('WITHDRAWAL_UNDER_12H', start - now));
  if (row.state === 'IN_PROGRESS' && row.checkInAt instanceof Date && !row.checkOutAt && now >= end + CHECK_OUT_GRACE_MS) out.push(lateReason('NOT_CHECKED_OUT_2H', now - end));
  return out.sort(compareReasons);
}

// Read model of the Staff visit board: the Needs action list, the All visits list and their counts.
export function createNeedsActionService({ repository, clock = Date.now, cursorSecret }) {
  const { col } = repository;
  let cursors;
  // Built on first use so a missing secret does not stop the whole scheduling module from starting.
  const cursor = () => {
    try { return cursors ??= createScopedCursor({ secret: cursorSecret, namespace: 'visit-board-v1', clock }); }
    catch { throw new AppError(503, 'VISIT_BOARD_UNAVAILABLE', 'Cursor signing is not configured'); }
  };

  async function people(rows) {
    const ids = [...new Set(rows.flatMap(row => [row.customerId, row.sitterId]).filter(Boolean).map(String))].map(oid);
    const users = ids.length ? await col('users').find({ _id: { $in: ids } }, { projection: { displayName: 1 } }).limit(ids.length).maxTimeMS(QUERY_MS).toArray() : [];
    const names = new Map(users.map(user => [String(user._id), user.displayName]));
    return value => (value ? names.get(String(value)) ?? null : null);
  }
  async function codes(rows) {
    const ids = [...new Set(rows.map(row => String(row.bookingId)))].map(oid);
    const bookings = ids.length ? await col('bookings').find({ _id: { $in: ids } }, { projection: { bookingCode: 1, code: 1 } }).limit(ids.length).maxTimeMS(QUERY_MS).toArray() : [];
    const byId = new Map(bookings.map(booking => [String(booking._id), booking.bookingCode ?? booking.code ?? null]));
    return value => byId.get(String(value)) ?? null;
  }
  async function decorate(rows, extra = () => ({})) {
    const [name, code] = await Promise.all([people(rows), codes(rows)]);
    return rows.map(row => ({ id: String(row._id), bookingId: String(row.bookingId), bookingCode: code(row.bookingId), version: row.version,
      serviceName: row.snapshots?.serviceName ?? null, startAt: row.startAt, endAt: row.endAt, areaCode: row.areaCode ?? null, state: row.state,
      customerName: name(row.customerId), sitterId: row.sitterId ? String(row.sitterId) : null, sitterName: name(row.sitterId),
      reviewCode: row.dispatchReview?.code ?? null, ...extra(row) }));
  }

  const scheduled = extra => col('visits').aggregate([
    { $match: { state: 'SCHEDULED', sitterId: null, ...extra } }, { $sort: { startAt: 1, _id: 1 } }, ...BOOKING_STAGES,
    { $limit: CAP + 1 }, { $project: PROJECTION }], { maxTimeMS: QUERY_MS }).toArray();

  // Every visit with at least one reason, read once per reason (each bounded), merged by visit.
  async function needsActionRows(now) {
    const find = (filter, sort) => col('visits').find(filter, { projection: PROJECTION }).sort(sort).limit(CAP + 1).maxTimeMS(QUERY_MS).toArray();
    const lists = await Promise.all([
      scheduled({ startAt: { $lte: new Date(now + NO_SITTER_WINDOW_MS) } }),
      scheduled({ 'dispatchReview.code': { $exists: true } }),
      find({ state: 'ASSIGNED', checkInAt: null, startAt: { $lte: new Date(now - CHECK_IN_GRACE_MS) } }, { startAt: 1, _id: 1 }),
      find({ state: 'ASSIGNED', checkInAt: null, 'withdrawalRequest.sitterId': { $exists: true } }, { startAt: 1, _id: 1 }),
      find({ state: 'IN_PROGRESS', checkInAt: { $type: 'date' }, checkOutAt: null, endAt: { $lte: new Date(now - CHECK_OUT_GRACE_MS) } }, { endAt: 1, _id: 1 })
    ]);
    const capped = lists.some(list => list.length > CAP);
    const merged = new Map();
    for (const row of lists.flatMap(list => list.slice(0, CAP))) merged.set(String(row._id), row);
    const rows = [];
    for (const row of merged.values()) {
      const reasons = reasonsOfVisit(row, now);
      if (reasons.length) rows.push({ row, reasons });
    }
    rows.sort((a, b) => compareReasons(a.reasons[0], b.reasons[0]) || a.row.startAt - b.row.startAt || String(a.row._id).localeCompare(String(b.row._id)));
    return { rows, capped };
  }

  function matchesSearch(item, term) {
    const needle = fold(term), tail = String(item.bookingId);
    return fold(item.customerName).includes(needle) || fold(item.sitterName).includes(needle) || fold(item.bookingCode).includes(needle)
      || (/^[a-f0-9]+$/u.test(needle) && (tail === needle || (needle.length >= 4 && tail.endsWith(needle))));
  }

  async function needsActionList(query, union) {
    let rows = union.rows;
    if (query.areaCode) rows = rows.filter(entry => entry.row.areaCode === query.areaCode);
    if (query.reason) rows = rows.filter(entry => entry.reasons.some(reason => reason.code === query.reason));
    const byId = new Map(rows.map(entry => [String(entry.row._id), entry]));
    const extra = row => ({ reasons: byId.get(String(row._id)).reasons });
    if (!query.search) {
      const items = await decorate(rows.slice(0, PAGE_SIZE).map(entry => entry.row), extra);
      return { items, hasMore: rows.length > PAGE_SIZE };
    }
    // Searching needs the names, so read them for the filtered set once (bounded by the per-reason cap).
    const all = (await decorate(rows.map(entry => entry.row), extra)).filter(item => matchesSearch(item, query.search));
    return { items: all.slice(0, PAGE_SIZE), hasMore: all.length > PAGE_SIZE };
  }

  // Visit ids that match the search text: people by name, a whole booking id, or a booking code.
  async function searchIds(term) {
    const ids = new Set();
    let limited = false;
    const users = await col('users').find({ displayName: { $regex: escapeRegex(term), $options: 'i' }, roles: { $in: ['CUSTOMER', 'PET_SITTER'] } },
      { projection: { roles: 1 } }).limit(PEOPLE_LIMIT + 1).maxTimeMS(2000).toArray();
    if (users.length > PEOPLE_LIMIT) { users.length = PEOPLE_LIMIT; limited = true; }
    const sitters = users.filter(user => user.roles.includes('PET_SITTER')).map(user => user._id);
    const customers = users.filter(user => user.roles.includes('CUSTOMER')).map(user => user._id);
    const add = list => { for (const value of list) { if (ids.size >= VISIT_ID_LIMIT) { limited = true; return; } ids.add(String(value)); } };
    if (sitters.length) add((await col('visits').find({ sitterId: { $in: sitters } }, { projection: { _id: 1 } }).limit(VISIT_ID_LIMIT + 1).maxTimeMS(QUERY_MS).toArray()).map(row => row._id));
    const bookingFilters = [];
    if (customers.length) bookingFilters.push({ customerId: { $in: customers } });
    if (/^[a-f0-9]{24}$/iu.test(term)) bookingFilters.push({ _id: oid(term) });
    bookingFilters.push({ bookingCode: term.toUpperCase() });
    const bookings = await col('bookings').find({ $or: bookingFilters }, { projection: { visitIds: 1 } }).limit(VISIT_ID_LIMIT).maxTimeMS(2000).toArray();
    add(bookings.flatMap(booking => booking.visitIds ?? []));
    return { ids, limited };
  }

  async function allVisitsList(actor, query, union, now) {
    const searching = Boolean(query.search);
    const filter = [];
    let limited = false;
    if (!searching) {
      const local = new Date(now + 7 * HOUR).toISOString().slice(0, 10);
      filter.push({ startAt: { $gte: new Date(`${local}T00:00:00+07:00`) } });
    }
    let allowed = null;
    const intersect = set => { allowed = allowed ? new Set([...allowed].filter(value => set.has(value))) : set; };
    if (searching) { const found = await searchIds(query.search); limited ||= found.limited; intersect(found.ids); }
    if (query.reason) intersect(new Set(union.rows.filter(entry => entry.reasons.some(reason => reason.code === query.reason)).map(entry => String(entry.row._id))));
    if (allowed) filter.push({ _id: { $in: [...allowed].map(oid) } });
    if (query.areaCode) filter.push({ areaCode: query.areaCode });
    const direction = searching ? -1 : 1, compare = direction === 1 ? '$gt' : '$lt';
    const context = { actor: actor.userId, tab: 'all', search: query.search ?? null, areaCode: query.areaCode ?? null, reason: query.reason ?? null };
    if (query.cursor) {
      const position = cursor().decode(query.cursor, context);
      if (!Number.isSafeInteger(position.s) || !/^[a-f0-9]{24}$/u.test(position.i ?? '')) fail('VALIDATION_FAILED', 'Invalid cursor');
      const at = new Date(position.s);
      filter.push({ $or: [{ startAt: { [compare]: at } }, { startAt: at, _id: { [compare]: oid(position.i) } }] });
    }
    const rows = await col('visits').find(filter.length ? { $and: filter } : {}, { projection: PROJECTION })
      .sort({ startAt: direction, _id: direction }).limit(PAGE_SIZE + 1).maxTimeMS(QUERY_MS).toArray();
    const page = rows.slice(0, PAGE_SIZE), last = page.at(-1);
    return { items: await decorate(page), hasMore: rows.length > PAGE_SIZE, limited,
      nextCursor: rows.length > PAGE_SIZE ? cursor().encode({ s: last.startAt.getTime(), i: String(last._id) }, context) : null };
  }

  return {
    async list(actor, rawQuery) {
      staffOnly(actor);
      const query = visitBoardQuery(rawQuery);
      const now = clock();
      const union = await needsActionRows(now);
      const body = query.tab === 'all' ? await allVisitsList(actor, query, union, now) : await needsActionList(query, union);
      // The counts ignore search and filters: they describe the whole list, not what is on screen.
      return { tab: query.tab, counts: { needsAction: union.rows.length, needsActionLimited: union.capped }, ...body, asOf: new Date(now) };
    }
  };
}
