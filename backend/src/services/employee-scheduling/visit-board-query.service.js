import { NEEDS_ACTION_REASONS } from '../../validators/needs-action.validator.js';

export const VISIT_BOARD_FIELDS = { _id: 1, bookingId: 1, customerId: 1, sitterId: 1, state: 1, version: 1,
  startAt: 1, endAt: 1, areaCode: 1, checkInAt: 1, checkOutAt: 1, assignedAt: 1, withdrawalRequest: 1,
  'dispatchReview.code': 1, 'snapshots.serviceName': 1 };
const MINUTE = 60000, HOUR = 60 * MINUTE;
const and = (...conditions) => ({ $and: conditions });
const eq = (left, right) => ({ $eq: [left, right] });
const missing = field => eq({ $ifNull: [field, null] }, null);
const stringId = field => ({ $convert: { input: field, to: 'string', onError: null, onNull: null } });
const branch = (condition, code) => ({ $cond: [condition, [code], []] });
const regex = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function candidateFilter(now) {
  return { $or: [
    { state: 'SCHEDULED', sitterId: null, $or: [
      { startAt: { $lte: new Date(now + 24 * HOUR) } },
      { 'dispatchReview.code': { $exists: true, $nin: [null, '', 'SHIFT_START_REACHED'] } }
    ] },
    { state: 'ASSIGNED', checkInAt: null, $or: [
      { startAt: { $lte: new Date(now - 30 * MINUTE) } }, { 'withdrawalRequest.sitterId': { $exists: true } }
    ] },
    { state: 'IN_PROGRESS', checkInAt: { $type: 'date' }, checkOutAt: null, endAt: { $lte: new Date(now - 2 * HOUR) } }
  ] };
}

// The same predicates feed the queue, count and filtered All tab. Filtering is done BEFORE
// pagination, so neither the first page nor an artificial per-reason cap hides actionable work.
export function visitReasonStages(now) {
  const noSitter = and(eq('$state', 'SCHEDULED'), missing('$sitterId'),
    eq('$__booking.carePlanState', 'APPROVED'), { $in: ['$__booking.state', ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS']] },
    { $or: [eq('$__booking.paymentMode', 'POSTPAY'), and(eq('$__booking.paymentMode', 'PREPAY'), eq('$__booking.paymentState', 'PAID'))] });
  const assigned = and(eq('$state', 'ASSIGNED'), missing('$checkInAt'));
  const pendingWithdrawal = and({ $ne: [stringId('$withdrawalRequest.sitterId'), null] },
    eq(stringId('$withdrawalRequest.sitterId'), stringId('$sitterId')),
    eq({ $ifNull: ['$withdrawalRequest.assignedAt', null] }, { $ifNull: ['$assignedAt', null] }));
  return [
    { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: '__booking',
      pipeline: [{ $project: { carePlanState: 1, state: 1, paymentMode: 1, paymentState: 1, bookingCode: 1, code: 1 } }] } },
    { $set: { __booking: { $first: '$__booking' } } },
    { $set: { __codes: { $concatArrays: [
      branch(and(noSitter, { $ne: [{ $ifNull: ['$dispatchReview.code', null] }, null] },
        { $not: [{ $in: ['$dispatchReview.code', ['', 'SHIFT_START_REACHED']] }] }), 'NO_SITTER_TO_OFFER'),
      branch(and(noSitter, { $lte: ['$startAt', new Date(now + 24 * HOUR)] }), 'NO_SITTER_24H'),
      branch(and(assigned, { $lte: ['$startAt', new Date(now - 30 * MINUTE)] }), 'NOT_CHECKED_IN_30M'),
      branch(and(assigned, pendingWithdrawal), 'WITHDRAWAL_UNDER_12H'),
      branch(and(eq('$state', 'IN_PROGRESS'), eq({ $type: '$checkInAt' }, 'date'), missing('$checkOutAt'),
        { $lte: ['$endAt', new Date(now - 2 * HOUR)] }), 'NOT_CHECKED_OUT_2H')
    ] } } },
    { $set: { __at: { $cond: [eq('$state', 'IN_PROGRESS'), '$endAt', '$startAt'] },
      __order: { $indexOfArray: [NEEDS_ACTION_REASONS, { $arrayElemAt: ['$__codes', 0] }] } } }
  ];
}

export function visitNeedsCountStages(now) {
  return [
    { $match: { ...candidateFilter(now), startAt: { $type: 'date' }, endAt: { $type: 'date' } } },
    { $project: VISIT_BOARD_FIELDS }, ...visitReasonStages(now),
    { $match: { '__codes.0': { $exists: true } } }, { $count: 'total' }
  ];
}

function searchStages(search) {
  const expression = { $regex: regex(search), $options: 'i' };
  const matches = [{ '__customer.displayName': expression }, { '__sitter.displayName': expression },
    { '__booking.bookingCode': expression }, { '__booking.code': expression }];
  if (/^[a-f0-9]{4,24}$/iu.test(search)) matches.push({ __bookingId: { $regex: regex(search) + '$', $options: 'i' } });
  return [
    { $lookup: { from: 'users', localField: 'customerId', foreignField: '_id', as: '__customer', pipeline: [{ $project: { displayName: 1 } }] } },
    { $lookup: { from: 'users', localField: 'sitterId', foreignField: '_id', as: '__sitter', pipeline: [{ $project: { displayName: 1 } }] } },
    { $set: { __bookingId: stringId('$bookingId') } }, { $match: { $or: matches } }
  ];
}

export function visitBoardPageStages({ query, now, position, oid, limit }) {
  const needs = query.tab === 'needs-action', direction = needs || !query.search ? 1 : -1;
  const initial = { startAt: { $type: 'date' }, endAt: { $type: 'date' }, state: { $ne: 'SUPERSEDED' },
    ...(query.areaCode ? { areaCode: query.areaCode } : {}), ...(needs || query.reason ? candidateFilter(now) : {}) };
  if (needs) initial.state = { $in: ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'] };
  else if (!query.search) {
    const local = new Date(now + 7 * HOUR).toISOString().slice(0, 10);
    initial.startAt.$gte = new Date(`${local}T00:00:00+07:00`);
  }
  const stages = [{ $match: initial }, { $project: VISIT_BOARD_FIELDS }, ...visitReasonStages(now)];
  if (needs) stages.push({ $match: { '__codes.0': { $exists: true } } });
  if (query.reason) stages.push({ $match: { __codes: query.reason } });
  if (query.search) stages.push(...searchStages(query.search));
  if (position) {
    const date = new Date(position.s), id = oid(position.i), compare = direction === 1 ? '$gt' : '$lt';
    const after = needs ? [
      { __at: { $gt: date } }, { __at: date, __order: { $gt: position.r } },
      { __at: date, __order: position.r, startAt: { $gt: new Date(position.t) } },
      { __at: date, __order: position.r, startAt: new Date(position.t), _id: { $gt: id } }
    ] : [{ startAt: { [compare]: date } }, { startAt: date, _id: { [compare]: id } }];
    stages.push({ $match: { $or: after } });
  }
  stages.push({ $sort: needs ? { __at: 1, __order: 1, startAt: 1, _id: 1 } : { startAt: direction, _id: direction } },
    { $limit: limit + 1 }, { $project: { ...VISIT_BOARD_FIELDS, __at: 1, __order: 1 } });
  return stages;
}
