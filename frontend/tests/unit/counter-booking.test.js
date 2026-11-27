import {
  buildCounterBookingInput, counterBookingCurrency, counterBookingDateLabel,
  counterBookingFormatDdMmYyyy, counterBookingParseDdMmYyyy,
  isCounterBookingReady, normalizeCounterBookingService
} from '../../src/utils/counter-booking.js';

test('normalizes priced catalog services without inventing unsupported locations', () => {
  expect(normalizeCounterBookingService({
    id: '1', name: 'Cắt móng', details: { category: 'Vệ sinh', locations: ['FACILITY', 'HOME', 'UNKNOWN'] },
    price: { amountVnd: 50000 }
  })).toMatchObject({ priceVnd: 50000, spa: true, locations: ['FACILITY', 'HOME'] });
  expect(counterBookingCurrency(182500)).toBe('182.500 đ');
  expect(counterBookingDateLabel('2026-11-28')).toContain('28/11/2026');
});
test('checkout body contains identity and selectable location, never frontend amounts', () => {
  const body = buildCounterBookingInput({
    customer: { id: 'customer' }, petIds: ['pet1'], date: '2026-11-28', time: '09:00',
    lines: [{ serviceId: 'svc', petIds: ['pet1'], location: 'FACILITY', spa: true, priceVnd: 100000 }],
    pickup: true, addressId: 'addr', paymentMethod: 'COUNTER_CASH'
  });
  expect(body).toMatchObject({ customerId: 'customer', pickup: { enabled: true, addressId: 'addr' },
    lines: [{ serviceId: 'svc', petIds: ['pet1'], location: 'FACILITY' }] });
  expect(JSON.stringify(body)).not.toContain('priceVnd');
  expect(isCounterBookingReady({ customer: { id: 'customer' }, petIds: ['pet1'],
    lines: body.lines, date: body.date, time: body.slot, quote: null, pickup: true, pickupQuote: null })).toBe(false);
  expect(isCounterBookingReady({ customer: { id: 'customer' }, petIds: ['pet1'],
    lines: body.lines, date: body.date, time: body.slot, quote: { totalVnd: null }, pickup: false })).toBe(false);
});
test('formats and parses dd/mm/yyyy dates strictly', () => {
  expect(counterBookingFormatDdMmYyyy('2026-11-29')).toBe('29/11/2026');
  expect(counterBookingParseDdMmYyyy('29/11/2026')).toBe('2026-11-29');
  expect(counterBookingParseDdMmYyyy('31/02/2026')).toBeNull();
  expect(counterBookingParseDdMmYyyy('11/29/2026')).toBeNull();
});
