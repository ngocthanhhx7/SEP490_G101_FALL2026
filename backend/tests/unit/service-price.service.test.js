import { describe, expect, test } from '@jest/globals';
import { parsePriceVersionInput } from '../../src/services/service-price.service.js';

const valid = {
  expectedVersion: 2, amountVnd: 125000, unitLabel: 'mỗi lượt',
  effectiveAt: '2026-10-14T00:00:00.000Z', reason: 'Giá đã được duyệt'
};

describe('service price input', () => {
  test('accepts a nonnegative integer VND amount and canonical UTC effective time', () => {
    expect(parsePriceVersionInput(valid)).toMatchObject({
      expectedVersion: 2, amountVnd: 125000, unitLabel: 'mỗi lượt',
      effectiveAt: new Date('2026-10-14T00:00:00.000Z'), reason: 'Giá đã được duyệt'
    });
  });

  test.each([-1, 12.5, Number.MAX_SAFE_INTEGER + 1, '125000'])('rejects amount %p without rounding or coercion', amountVnd => {
    expect(() => parsePriceVersionInput({ ...valid, amountVnd })).toThrow(expect.objectContaining({
      status: 422, code: 'VALIDATION_FAILED'
    }));
  });

  test('rejects unknown keys and timestamps without UTC offset', () => {
    expect(() => parsePriceVersionInput({ ...valid, currency: 'USD' })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => parsePriceVersionInput({ ...valid, effectiveAt: '2026-10-14T07:00:00' }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => parsePriceVersionInput({ ...valid, effectiveAt: '2026-02-30T00:00:00Z' }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
