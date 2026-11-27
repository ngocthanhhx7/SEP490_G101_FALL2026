export const COUNTER_BOOKING_LOCATION_LABELS = Object.freeze({
  HOME: 'Tại nhà',
  FACILITY: 'Tại cửa hàng',
  OUTDOOR: 'Ngoài trời'
});

export const COUNTER_BOOKING_SLOTS = Object.freeze(['08:00', '09:00', '10:00', '11:00', '14:00', '15:00']);

export const counterBookingCurrency = value => Number.isSafeInteger(value) && value >= 0
  ? new Intl.NumberFormat('vi-VN').format(value) + ' đ'
  : '—';

export const counterBookingLocalDate = (offsetDays = 1, now = new Date()) => {
  const date = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
};

export function counterBookingDateLabel(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const time = new Date(date + 'T00:00:00+07:00');
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(time);
}

export const counterBookingTierLabel = value => ({
  SILVER: 'Bạc', GOLD: 'Vàng', MEMBER: 'Thành viên', DIAMOND: 'Kim cương'
})[value] ?? value ?? 'Thành viên';

export function normalizeCounterBookingService(service) {
  const locations = service.locations ?? service.details?.locations ?? [];
  const priceVnd = service.priceVnd ?? service.price?.amountVnd ?? service.priceFromVnd;
  const category = service.category ?? service.details?.category ?? '';
  return {
    id: service.id,
    name: service.name,
    priceVnd: Number.isSafeInteger(priceVnd) ? priceVnd : null,
    unitLabel: service.unitLabel ?? service.price?.unitLabel ?? null,
    locations: locations.filter(location => Object.hasOwn(COUNTER_BOOKING_LOCATION_LABELS, location)),
    spa: service.spa === true || (service.spa === undefined
      && ['Vệ sinh', 'Làm đẹp'].includes(category) && locations.includes('FACILITY'))
  };
}

export function buildCounterBookingInput({ customer, petIds, lines, pickup, addressId, date, time, paymentMethod, answers }) {
  return {
    customerId: customer.id,
    petIds,
    date,
    slot: time,
    paymentMethod,
    lines: lines.map(line => ({
      serviceId: line.serviceId,
      petIds: line.petIds,
      location: line.location,
      ...(line.spa && line.location === 'FACILITY' ? {} : {
        visitCount: line.visitCount,
        starts: Array.from({ length: line.visitCount }, (_, i) => line.starts?.[i] ? line.starts[i] + ':00+07:00' : ''),
        ...(line.unitLabel === 'ngày' ? { dayCount: line.dayCount ?? 1 } : {}),
        ...(line.location !== 'FACILITY' ? { addressId: line.addressId } : {})
      })
    })),
    pickup: pickup ? { enabled: true, addressId } : { enabled: false },
    ...(answers ? { answers } : {})
  };
}

export function isCounterBookingReady({ customer, petIds, lines, date, time, quote, pickup, pickupQuote }) {
  return Boolean(customer?.id && petIds.length && lines.length && date && time
    && Number.isSafeInteger(quote?.totalVnd) && quote.totalVnd >= 0
    && lines.every(line => line.location === 'FACILITY' || Boolean(line.addressId))
    && (!pickup || (pickupQuote && pickupQuote.allowed === true)));
}
