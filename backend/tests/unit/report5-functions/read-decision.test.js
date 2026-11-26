import { test, expect, jest } from '@jest/globals';
import { createPricingService } from '../../../src/services/pricing/pricing.service.js';

// QUOTE-03: một test cho mỗi UTCID trong QUOTE-03_readDecision.
// Chỉ các tình huống SRS được ghi cạnh từng test. Không test TTL/ID sai/DB failure.
// Factory chỉ tạo dependency; không kiểm thử các method khác trong file này.

const OWNER = '111111111111111111111111';
const OTHER_OWNER = '222222222222222222222222';
const QUOTE_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';
const NOW = Date.parse('2026-11-12T03:00:00Z');

function subject() {
  // Bản ghi giả chỉ phục vụ hiển thị giá của đúng Customer trước Confirm.
  // Kind/expiry hợp lệ là precondition kỹ thuật; không tạo ca TTL 10 phút.
  const record = {
    _id: QUOTE_ID, ownerId: OWNER, kind: 'QUOTE', expiresAt: new Date(NOW + 600000),
    snapshot: { result: { totalVnd: 100000, subtotalVnd: 100000, currency: 'VND',
      lines: [{ code: 'BASE', amountVnd: 100000 }] } },
  };
  const findOne = jest.fn(filter => ({
    select: () => ({ lean: async () => {
      const matches = filter._id === record._id && filter.ownerId === record.ownerId &&
        filter.kind === record.kind && record.expiresAt > filter.expiresAt.$gt;
      return matches ? globalThis.structuredClone(record) : null;
    } }),
  }));
  const repository = { models: { DecisionSnapshot: { findOne } } };
  const readDecision = createPricingService({ repository, clock: () => NOW }).readDecision;
  return { readDecision, findOne };
}

// SRS: UC-25 bước 4; III.7.1 Booking — Summary and price; giới hạn dữ liệu Customer theo I.4.4/GBR-02.
test("QUOTE-03-UTCID01 [N] Đúng khách hàng được đọc tổng giá của lựa chọn đang xem", async () => {
  const { readDecision, findOne } = subject();

  const actual = await readDecision(OWNER, QUOTE_ID);

  expect(actual).toMatchObject({ totalVnd: 100000, subtotalVnd: 100000, currency: 'VND' });
  expect(actual.lines).toEqual([{ code: 'BASE', amountVnd: 100000 }]);
  expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OWNER, _id: QUOTE_ID }));
});

// SRS: I.4.4 Permission Matrix — Customer Restricted, note 5; GBR-02; IV.2.3 server kiểm tra quyền mỗi request.
test("QUOTE-03-UTCID02 [A] Khách hàng khác không được đọc dữ liệu giá của chủ bản ghi", async () => {
  const { readDecision, findOne } = subject();

  await expect(readDecision(OTHER_OWNER, QUOTE_ID)).rejects.toMatchObject({
    name: 'AppError', status: 404, code: 'RESOURCE_NOT_FOUND',
  });
  expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OTHER_OWNER }));
});
