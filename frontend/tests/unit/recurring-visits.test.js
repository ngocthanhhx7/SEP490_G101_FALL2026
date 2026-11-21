import { recurringVisits } from '../../src/utils/recurring-visits.js';

const base = { frequency: 'monthly', startDay: '2027-12-31', time: '09:30', weekdays: [1,3], ending: 'count', count: 4, until: '' };
const make = rule => recurringVisits({ ...base, ...rule }, '2026-11-22T08:00');
test('keeps the requested day across years and skips short months', () => {
  expect(make({})).toEqual({ visits: ['2027-12-31','2028-01-31','2028-03-31','2028-05-31'].map(d => d+'T09:30'), skipped: ['2028-02','2028-04'] });
  expect(make({ startDay:'2028-01-29', count:2 }).visits[1]).toBe('2028-02-29T09:30');
});
test('weekly dates use multiple weekdays and include the final day', () => {
  expect(make({ frequency:'weekly', startDay:'2026-12-01', ending:'date', until:'2026-12-09' }).visits)
    .toEqual(['2026-12-02T09:30','2026-12-07T09:30','2026-12-09T09:30']);
});
test('caps a series and rejects invalid, empty or too-early ranges', () => {
  expect(make({ count:60 }).visits).toHaveLength(60);
  for (const rule of [{count:61},{startDay:'2027-02-30'},{frequency:'weekly',weekdays:[]},
    {ending:'date',until:'2050-01-01'},{startDay:'2026-11-22',time:'07:59'}]) expect(make(rule).error).toBeTruthy();
});
