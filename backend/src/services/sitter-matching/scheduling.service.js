import { fail, instant, number } from '../../validators/pet-care.validator.js';
export const SCHEDULE_RULES = Object.freeze({
  handoverMinutes: 15,
  travelBufferMinutes: 10,
  travelBufferRatio: 0.2,
  maxLegMinutes: 45,
  maxServiceMinutes: 360,
  maxBusyMinutes: 480,
  maxContinuousMinutes: 240,
  minimumBreakMinutes: 30
});
export function localDay(at) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(at));
}
export function localMinute(at) {
  const date = new Date(at + 7 * 3600000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
export function validateSlot(slot, now) {
  const start = instant(slot.startAt),
    end = instant(slot.endAt);
  if (
    start < now + 24 * 3600000 ||
    end <= start ||
    end - start > 6 * 3600000 ||
    localDay(start) !== localDay(end - 1)
  )
    fail(
      'SLOT_INVALID',
      'Slot must be same local day, 24h ahead and at most 6h'
    );
  if (start % 60000 || end % 60000)
    fail('SLOT_INVALID', 'Whole-minute slots required');
  return { start, end, localDate: localDay(start) };
}
const pt = (x) => x.point?.coordinates ?? x.point;
const pad = (eta) =>
  Math.max(
    SCHEDULE_RULES.travelBufferMinutes,
    Math.ceil(eta * SCHEDULE_RULES.travelBufferRatio)
  );
async function timeline(items, origin, endPoint, matrix) {
  let busy = 0,
    service = 0,
    continuous = 0,
    route = 0;
  let previous = origin;
  for (const item of [...items, endPoint]) {
    const eta = matrix(previous.point, pt(item));
    if (eta === null || !Number.isFinite(eta) || eta < 0)
      return { reason: 'ROUTE_UNAVAILABLE' };
    if (eta > SCHEDULE_RULES.maxLegMinutes)
      return { reason: 'TRAVEL_LEG_TOO_LONG' };
    const travel =
        JSON.stringify(previous.point) === JSON.stringify(pt(item))
          ? 0
          : Math.ceil(eta) + pad(eta),
      handover = previous.kind === 'VISIT' ? SCHEDULE_RULES.handoverMinutes : 0;
    if (previous.end + 60000 * (travel + handover) > item.start)
      return { reason: 'TRAVEL_TIME_CONFLICT' };
    route += travel + handover;
    busy += travel + handover;
    continuous += travel + handover;
    if (continuous > SCHEDULE_RULES.maxContinuousMinutes)
      return { reason: 'BREAK_REQUIRED' };
    if (item.kind === 'END') break;
    const duration = (item.end - item.start) / 60000;
    busy += duration;
    if (item.kind === 'BREAK' && duration >= SCHEDULE_RULES.minimumBreakMinutes)
      continuous = 0;
    else {
      continuous += duration;
      if (item.kind === 'VISIT') service += duration;
    }
    if (continuous > SCHEDULE_RULES.maxContinuousMinutes)
      return { reason: 'BREAK_REQUIRED' };
    previous = { ...item, point: item.endPoint ?? pt(item) };
  }
  if (
    busy > SCHEDULE_RULES.maxBusyMinutes ||
    service > SCHEDULE_RULES.maxServiceMinutes
  )
    return { reason: 'DAILY_CAPACITY' };
  return { busyMinutes: busy, routeMinutes: route, serviceMinutes: service };
}
export async function planInsertion({
  profile,
  blocks,
  slot,
  address,
  matrix,
  serviceEndPoint
}) {
  const originRecord = profile.starts.find(
    (x) => x.localDate === slot.localDate
  );
  if (!originRecord) return { eligible: false, reason: 'DAY_ORIGIN_MISSING' };
  if (profile.dayOffDates.includes(slot.localDate))
    return { eligible: false, reason: 'DAY_OFF' };
  const weekday = new Date(slot.start + 7 * 3600000).getUTCDay();
  const window = profile.windows.find(
    (x) =>
      x.weekday === weekday &&
      x.startMinute <= localMinute(slot.start) &&
      x.endMinute >= localMinute(slot.end - 1) + 1
  );
  if (!window) return { eligible: false, reason: 'OUTSIDE_WORKING_HOURS' };
  const origin = {
    point: pt(originRecord),
    end: new Date(originRecord.availableFrom).getTime(),
    kind: 'START'
  };
  const finish = {
    point: pt(originRecord),
    start: new Date(originRecord.availableUntil).getTime(),
    kind: 'END'
  };
  if (
    !Number.isFinite(origin.end) ||
    !Number.isFinite(finish.start) ||
    origin.end >= slot.start ||
    finish.start <= slot.end
  )
    return { eligible: false, reason: 'OUTSIDE_DAY_BOUNDS' };
  // Origin/end bounds must themselves be within the same declared working window.
  if (
    localDay(origin.end) !== slot.localDate ||
    localDay(finish.start - 1) !== slot.localDate ||
    localMinute(origin.end) < window.startMinute ||
    localMinute(finish.start - 1) + 1 > window.endMinute
  )
    return { eligible: false, reason: 'DAY_BOUNDS_INVALID' };
  const existing = blocks
    .map((b) => ({
      id: String(b._id),
      start: new Date(b.startAt).getTime(),
      end: new Date(b.endAt).getTime(),
      point: pt(b),
      endPoint: b.endPoint?.coordinates,
      kind: b.kind
    }))
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < existing.length; i++)
    if (
      !Number.isFinite(existing[i].start) ||
      !Number.isFinite(existing[i].end) ||
      existing[i].end <= existing[i].start ||
      (i && existing[i - 1].end > existing[i].start)
    )
      return { eligible: false, reason: 'SCHEDULE_DATA_INVALID' };
  if (existing.some((b) => b.start < slot.end && b.end > slot.start))
    return { eligible: false, reason: 'VISIT_CONFLICT' };
  const added = {
    start: slot.start,
    end: slot.end,
    point: address.point.coordinates,
    endPoint: serviceEndPoint,
    kind: 'VISIT',
    id: 'NEW'
  };
  const sorted = [...existing, added].sort((a, b) => a.start - b.start);
  const baseline = await timeline(existing, origin, finish, matrix);
  const proposed = await timeline(sorted, origin, finish, matrix);
  if (baseline.reason || proposed.reason)
    return { eligible: false, reason: proposed.reason || baseline.reason };
  const index = sorted.findIndex((x) => x.id === 'NEW');
  number(proposed.busyMinutes, 0, 480);
  return {
    eligible: true,
    busyMinutes: proposed.busyMinutes,
    extraTravelMinutes: Math.max(
      0,
      proposed.routeMinutes - baseline.routeMinutes
    ),
    beforeVisitId: sorted[index - 1]?.id ?? null,
    afterVisitId: sorted[index + 1]?.id ?? null,
    rules: SCHEDULE_RULES
  };
}
export function requiredPoints(profile, blocks, address, date) {
  const origin = profile.starts.find((x) => x.localDate === date);
  return [
    address.point.coordinates,
    ...(origin ? [pt(origin)] : []),
    ...blocks.flatMap((b) => [
      pt(b),
      ...(b.endPoint ? [b.endPoint.coordinates] : [])
    ])
  ];
}
