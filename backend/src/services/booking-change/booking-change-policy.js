import { AppError } from '../../utils/app-error.js';
import { schedulingDate } from '../employee-scheduling/schedule-policy.service.js';

export const HOUR = 3600000;
const DAY = 24 * HOUR;
const CHANGEABLE = new Set(['SCHEDULED', 'OFFERED', 'ASSIGNED']);
export const BOOKING_CHANGE_STATES = ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'];
const MINIMUM_LEAD_MESSAGE = 'Gửi yêu cầu trước giờ cũ ít nhất 12 giờ, cho giờ mới cách bây giờ ít nhất 24 giờ.';

export function futureVisit(visit, now) {
  return CHANGEABLE.has(visit.state) && !visit.checkInAt && visit.startAt > now;
}

export function visitSlots(visits) {
  const perDay = new Map();
  return visits.map(visit => {
    const day = schedulingDate(visit.startAt);
    const slot = perDay.get(day) ?? 0;
    perDay.set(day, slot + 1);
    return { visit, day, slot };
  });
}

export function chooseChange(input, visits, now) {
  if (input.scope === 'VISIT') {
    const visit = visits.find(row => String(row._id) === input.visitId);
    if (!visit) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Buổi không có trong lịch đặt.');
    return { selected: [{ visit, startAt: input.startAt }], keptVisitIds: [] };
  }
  const slots = visitSlots(visits).filter(({ visit }) => futureVisit(visit, now));
  const eligible = slots.filter(({ visit }) => visit.startAt - now >= 12 * HOUR);
  if (!eligible.length) throw new AppError(422, 'MSG54', MINIMUM_LEAD_MESSAGE);
  const slotOrder = [...new Set(eligible.map(({ slot }) => slot))].sort((a, b) => a - b);
  if (slotOrder.length !== input.times.length) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Chọn giờ mới cho từng khung giờ có buổi cần đổi.');
  }
  const oldFirst = Date.parse(eligible[0].day + 'T00:00:00Z');
  const newFirst = Date.parse(input.firstDay + 'T00:00:00Z');
  return {
    selected: eligible.map(({ visit, day, slot }) => {
      const offset = Date.parse(day + 'T00:00:00Z') - oldFirst;
      const newDay = new Date(newFirst + offset).toISOString().slice(0, 10);
      return { visit, startAt: new Date(newDay + 'T' + input.times[slotOrder.indexOf(slot)] + ':00+07:00') };
    }),
    keptVisitIds: slots.filter(({ visit }) => visit.startAt - now < 12 * HOUR).map(({ visit }) => String(visit._id))
  };
}

export function checkLeadTime(selected, now) {
  if (selected.some(({ visit, startAt }) => !futureVisit(visit, now) ||
    visit.startAt - now < 12 * HOUR || startAt - now < DAY)) {
    throw new AppError(422, 'MSG54', MINIMUM_LEAD_MESSAGE);
  }
}

export function buildChangeItems(selected) {
  return selected.map(({ visit, startAt }) => ({
    visitId: String(visit._id), oldVersion: visit.version, oldStartAt: visit.startAt, oldEndAt: visit.endAt,
    newStartAt: startAt, newEndAt: new Date(+startAt + (visit.endAt - visit.startAt))
  }));
}

export function changeDeadline(items) {
  return new Date(Math.min(...items.flatMap(item => [+item.oldStartAt, +item.newStartAt])) - 6 * HOUR);
}

export function resultingSchedule(visits, items) {
  const changes = new Map(items.map(item => [item.visitId, item]));
  return visits.map(visit => {
    const item = changes.get(String(visit._id));
    return item ? { ...visit, startAt: item.newStartAt, endAt: item.newEndAt } : visit;
  }).sort((a, b) => a.startAt - b.startAt || String(a._id).localeCompare(String(b._id)));
}

export function scheduleViolation(visits) {
  const days = new Map();
  for (const visit of visits) {
    const day = schedulingDate(visit.startAt);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(visit);
  }
  const dates = [...days.keys()];
  if (Date.parse(dates.at(-1)) - Date.parse(dates[0]) >= 30 * DAY)
    return { code: 'MSG20', reasonCode: 'BOOKING_TOO_LONG', message: 'Một lịch đặt kéo dài tối đa 30 ngày.' };
  if ([...days.values()].some(day => day.length > 2))
    return { code: 'MSG150', reasonCode: 'TOO_MANY_VISITS', message: 'Mỗi ngày có tối đa hai buổi thuộc lịch đặt này.' };
  for (const [first, second] of days.values()) {
    if (second && second.startAt < first.endAt)
      return { code: 'MSG148', reasonCode: 'VISIT_BEFORE_PREVIOUS_END',
        message: 'Buổi 2 phải bắt đầu khi buổi 1 kết thúc hoặc muộn hơn.', time: first.endAt };
  }
  return null;
}

const staffReasons = {
  PET_OVERLAP: 'thú cưng đã có lịch khác vào giờ đó',
  VISIT_BEFORE_PREVIOUS_END: 'buổi 2 bắt đầu trước khi buổi 1 kết thúc',
  TOO_MANY_VISITS: 'một ngày có quá hai buổi',
  BOOKING_TOO_LONG: 'lịch đặt kéo dài quá 30 ngày'
};

export function assertSchedule(violation, staff) {
  if (!violation) return;
  const { code, message, reasonCode, ...fields } = violation;
  if (!staff) throw new AppError(422, code, message, fields);
  const reason = staffReasons[reasonCode];
  throw new AppError(422, 'MSG151', 'Không thể duyệt thay đổi này vì ' + reason + '. Vui lòng từ chối yêu cầu.', { reasonCode, reason });
}
