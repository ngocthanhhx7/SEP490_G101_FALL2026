import { describe, expect, test } from '@jest/globals';
import { parseCatalogSettingInput } from '../../src/services/system-settings.service.js';

const valid = {
  expectedVersion: 1, enabled: true, effectiveAt: '2026-10-14T00:00:00.000Z',
  reason: 'Đã duyệt'
};

describe('catalog visibility setting input', () => {
  test('accepts a versioned visibility decision with actor-independent effective time', () => {
    expect(parseCatalogSettingInput(valid)).toEqual({
      expectedVersion: 1, enabled: true, effectiveAt: new Date('2026-10-14T00:00:00.000Z'),
      reason: 'Đã duyệt'
    });
  });

  test.each([
    { ...valid, enabled: 'true' },
    { ...valid, expectedVersion: -1 },
    { ...valid, effectiveAt: '2026-10-14T07:00:00' },
    { ...valid, effectiveAt: '2026-02-30T00:00:00Z' },
    { ...valid, hidden: false }
  ])('rejects invalid visibility config %j', input => {
    expect(() => parseCatalogSettingInput(input)).toThrow(expect.objectContaining({
      status: 422, code: 'VALIDATION_FAILED'
    }));
  });
});
