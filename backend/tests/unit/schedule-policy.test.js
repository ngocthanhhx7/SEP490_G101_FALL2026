import { describe, expect, test } from '@jest/globals';
import { occupiedMinutes, windowsCover } from '../../src/services/employee-scheduling/schedule-policy.service.js';

const monday = time => Date.parse(`2026-11-16T${time}:00+07:00`);
const windowOnMonday = (startLocalTime, endLocalTime) => ({ weekday: 1, startLocalTime, endLocalTime });

describe('windowsCover', () => {
  test('includes both boundaries of a working window [SHIFT-POL-01-UTCID02]', () => {
    const windows = [windowOnMonday('08:00', '12:00')];
    expect(windowsCover(windows, monday('08:00'), monday('12:00'))).toBe(true);
  });

  test.each([
    ['starts one minute early', '07:59', '09:00', 'SHIFT-POL-01-UTCID04'],
    ['ends one minute late', '11:00', '12:01', 'SHIFT-POL-01-UTCID03']
  ])('rejects a visit that %s (%s–%s) [%s]', (_label, start, end) => {
    expect(windowsCover([windowOnMonday('08:00', '12:00')], monday(start), monday(end))).toBe(false);
  });

  test('rejects a visit across a break [SHIFT-POL-01-UTCID05]', () => {
    const windows = [windowOnMonday('08:00', '12:00'), windowOnMonday('13:00', '17:00')];
    expect(windowsCover(windows, monday('11:00'), monday('14:00'))).toBe(false);
  });

  test('accepts a visit across adjacent windows [SHIFT-POL-01-UTCID06]', () => {
    const windows = [windowOnMonday('08:00', '12:00'), windowOnMonday('12:00', '17:00')];
    expect(windowsCover(windows, monday('11:00'), monday('13:00'))).toBe(true);
  });

  test('uses the previous local day for an overnight shop window and excludes it from home visits', () => {
    const windows = [{ ...windowOnMonday('22:00', '02:00'), workLocation: 'SHOP' }];
    const start = '2026-11-17T00:15:00+07:00';
    const end = '2026-11-17T01:30:00+07:00';

    expect(windowsCover(windows, start, end, 'SHOP')).toBe(true);
    expect(windowsCover(windows, start, end)).toBe(false);
  });
});

describe('occupiedMinutes', () => {
  test('excludes a busy interval that starts at the upper boundary [SHIFT-POL-02-UTCID04]', () => {
    const rows = [{ startAt: monday('12:00'), endAt: monday('13:00') }];
    expect(occupiedMinutes(rows, monday('08:00'), monday('12:00'))).toBe(0);
  });

  test('adds only the portions inside the requested range [SHIFT-POL-02-UTCID02/05]', () => {
    const rows = [
      { startAt: monday('07:30'), endAt: monday('08:30') },
      { startAt: monday('11:40'), endAt: monday('12:30') }
    ];
    expect(occupiedMinutes(rows, monday('08:00'), monday('12:00'))).toBe(50);
  });
});
