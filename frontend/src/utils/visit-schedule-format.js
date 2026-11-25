const VIETNAM_ZONE = 'Asia/Ho_Chi_Minh';

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIETNAM_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const timePartsFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_ZONE,
  weekday: 'long'
});

export const VISIT_SCHEDULE_LEGEND = Object.freeze([
  { key: 'COMPLETED', label: 'Đã xong', tone: 'done' },
  { key: 'IN_PROGRESS', label: 'Đang làm', tone: 'active' },
  { key: 'ASSIGNED', label: 'Đã nhận', tone: 'assigned' },
  { key: 'OFFERED', label: 'Đang mời người', tone: 'waiting' },
  { key: 'SCHEDULED', label: 'Đang tìm người', tone: 'waiting' },
  { key: 'CANCELLED', label: 'Đã huỷ', tone: 'cancelled' }
]);

function validMs(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function vietnamDateKey(value) {
  const ms = validMs(value);
  if (ms === null) return null;
  const parts = Object.fromEntries(
    datePartsFormatter.formatToParts(new Date(ms)).map(part => [part.type, part.value])
  );
  return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function vietnamTime(value) {
  const ms = validMs(value);
  if (ms === null) return '—';
  const parts = Object.fromEntries(
    timePartsFormatter.formatToParts(new Date(ms)).map(part => [part.type, part.value])
  );
  return parts.hour && parts.minute ? `${parts.hour}:${parts.minute}` : '—';
}

export function vietnamShortDate(dateKey) {
  const match = typeof dateKey === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return match ? `${match[3]}/${match[2]}` : '—';
}

export function vietnamFullDate(dateKey) {
  const match = typeof dateKey === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}

export function vietnamWeekdayLabel(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  const raw = weekdayFormatter.format(new Date(`${dateKey}T12:00:00+07:00`));
  return raw ? raw[0].toLocaleUpperCase('vi-VN') + raw.slice(1) : '';
}

export function bookingDisplayCode(booking, fallbackId = '') {
  const explicit = booking?.bookingCode || booking?.code || booking?.reference;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const rawId = booking?.id ?? fallbackId;
  return typeof rawId === 'string' && rawId ? `#${rawId.slice(-8).toUpperCase()}` : '';
}

export function visitDisplayStatus(visit, { bookingCancelled = false } = {}) {
  if (bookingCancelled || visit?.state === 'CANCELLED') {
    return { key: 'CANCELLED', label: 'Đã huỷ', tone: 'cancelled' };
  }
  switch (visit?.state) {
    case 'COMPLETED':
      return { key: 'COMPLETED', label: 'Đã xong', tone: 'done' };
    case 'STAFF_CLOSED':
      return { key: 'STAFF_CLOSED', label: 'Đã đóng', tone: 'done' };
    case 'IN_PROGRESS':
      return { key: 'IN_PROGRESS', label: 'Đang làm', tone: 'active' };
    case 'ARRIVED':
      return { key: 'ARRIVED', label: 'Đã đến', tone: 'active' };
    case 'ASSIGNED':
      return { key: 'ASSIGNED', label: 'Đã nhận', tone: 'assigned' };
    case 'OFFERED':
      return { key: 'OFFERED', label: 'Đang mời người', tone: 'waiting' };
    case 'SCHEDULED':
      if (!visit.sitterName && visit.hasPendingOffer === true) {
        return { key: 'OFFERED', label: 'Đang mời người', tone: 'waiting' };
      }
      return { key: 'SCHEDULED', label: 'Đang tìm người', tone: 'waiting' };
    default:
      return { key: visit?.state ?? 'UNKNOWN', label: 'Đang cập nhật', tone: 'waiting' };
  }
}

export function visitPersonLabel(visit, status) {
  if (status?.key === 'CANCELLED') return visit?.sitterName || 'Đã huỷ';
  if (visit?.sitterName) return visit.sitterName;
  if (status?.key === 'OFFERED') return 'Đang chờ trả lời';
  return 'Chưa có người';
}

export function visitMovedLabel(visit) {
  const previousMs = validMs(visit?.previousStartAt);
  const currentMs = validMs(visit?.startAt);
  if (previousMs === null || currentMs === null || previousMs === currentMs) return null;
  const previousKey = vietnamDateKey(previousMs);
  const currentKey = vietnamDateKey(currentMs);
  const previousTime = vietnamTime(previousMs);
  if (previousKey && currentKey && previousKey !== currentKey) {
    return `Đã đổi giờ từ ${previousTime} ${vietnamShortDate(previousKey)}`;
  }
  return `Đã đổi giờ từ ${previousTime}`;
}

export function groupVisitsByVietnamDay(visits, { now = Date.now(), bookingCancelled = false } = {}) {
  const todayKey = vietnamDateKey(now);
  const sorted = [...(visits ?? [])].sort((left, right) => {
    const leftMs = validMs(left?.startAt) ?? Number.MAX_SAFE_INTEGER;
    const rightMs = validMs(right?.startAt) ?? Number.MAX_SAFE_INTEGER;
    if (leftMs !== rightMs) return leftMs - rightMs;
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
  });
  const byDay = new Map();
  for (const visit of sorted) {
    const dateKey = vietnamDateKey(visit?.startAt) ?? 'unknown';
    const status = visitDisplayStatus(visit, { bookingCancelled });
    const cancelled = status.key === 'CANCELLED';
    const card = {
      id: visit.id,
      startAt: visit.startAt,
      endAt: visit.endAt,
      timeRange: `${vietnamTime(visit.startAt)} – ${vietnamTime(visit.endAt)}`,
      personLabel: visitPersonLabel(visit, status),
      status,
      movedLabel: visitMovedLabel(visit),
      cancelled,
      clickable: !cancelled && Boolean(visit.id)
    };
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, {
        dateKey,
        weekday: dateKey === 'unknown' ? '' : vietnamWeekdayLabel(dateKey),
        shortDate: dateKey === 'unknown' ? '—' : vietnamShortDate(dateKey),
        isToday: dateKey !== 'unknown' && dateKey === todayKey,
        visits: []
      });
    }
    byDay.get(dateKey).visits.push(card);
  }
  return [...byDay.values()];
}

function joinVietnameseTimes(times) {
  if (times.length === 0) return '';
  if (times.length === 1) return times[0];
  if (times.length === 2) return `${times[0]} và ${times[1]}`;
  return `${times.slice(0, -1).join(', ')} và ${times.at(-1)}`;
}

export function formatBookingScheduleSummary(booking, dayColumns) {
  const terms = booking?.details?.terms ?? [];
  const visits = booking?.details?.visits ?? [];
  const services = [...new Set(terms.map(row => row?.serviceName).filter(Boolean))];
  const serviceText = services.length ? services.join(' · ') : 'Lịch chăm sóc thú cưng';

  const validDays = (dayColumns ?? []).map(col => col.dateKey).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
  let dateRange = '';
  if (validDays.length === 1) {
    dateRange = vietnamFullDate(validDays[0]);
  } else if (validDays.length > 1) {
    const first = validDays[0];
    const last = validDays.at(-1);
    dateRange = first.slice(0, 4) === last.slice(0, 4)
      ? `${vietnamShortDate(first)} – ${vietnamFullDate(last)}`
      : `${vietnamFullDate(first)} – ${vietnamFullDate(last)}`;
  }

  let timeSummary = '';
  const perDayTimes = (dayColumns ?? []).map(col =>
    [...new Set(col.visits.map(item => vietnamTime(item.startAt)).filter(value => value !== '—'))].sort()
  ).filter(list => list.length > 0);
  const consecutiveDays = validDays.length === perDayTimes.length && validDays.every((key, i) =>
    i === 0 || Date.parse(key) - Date.parse(validDays[i - 1]) === 86_400_000);
  if (perDayTimes.length >= 2 && consecutiveDays && perDayTimes.every(list => list.join('|') === perDayTimes[0].join('|'))) {
    timeSummary = `${joinVietnameseTimes(perDayTimes[0])} mỗi ngày`;
  } else {
    const uniqueTimes = [...new Set(perDayTimes.flat())].sort();
    if (uniqueTimes.length > 0) timeSummary = uniqueTimes.join(', ');
  }

  const countText = `${visits.length} buổi`;
  return [serviceText, dateRange, timeSummary, countText].filter(Boolean).join(' · ');
}
