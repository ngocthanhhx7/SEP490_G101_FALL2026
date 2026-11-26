import { test, expect } from '@jest/globals';
import { bookingCheckoutInput } from '../../../src/validators/booking-checkout.validator.js';

// UC-25 / III.7.1 / GBR-09/34. Mỗi UTCID dưới đây chỉ gọi bookingCheckoutInput.
// Đây là kiểm tra DTO: không chứng minh sở hữu địa chỉ, eligibility, notice 24 h
// hoặc giới hạn số lượt MỖI NGÀY. Các quyết định đó thuộc domain service.
const IDS = {
  quote: '111111111111111111111111', address: '222222222222222222222222',
  formerSitter: '333333333333333333333333',
};
const FIRST = Date.parse('2026-11-14T01:00:00.000Z'); // 08:00 tại Việt Nam.
function visit(offsetHours = 0) {
  return { itemIndex: 0, startAt: new Date(FIRST + offsetHours * 3600000).toISOString(),
    location: 'HOME', addressId: IDS.address };
}
function inputFor(visits = [visit()]) {
  return { quoteId: IDS.quote, visits, acceptServicePolicies: true };
}
function visitsForDays(days) {
  // Hai lượt 08:00 / 16:00 mỗi ngày, đủ mọi ngày; không lặp cùng thời điểm.
  return Array.from({ length: days }, (_, day) => [visit(day * 24), visit(day * 24 + 8)]).flat();
}

// SRS: UC-25 bước 3/6; III.7.1 Address, Visit time, Responsibility policy.
test("BKG-INPUT-01-UTCID01 [N] Một lượt có địa chỉ và đồng ý chính sách được chấp nhận", () => {
  const input = inputFor();

  const actual = bookingCheckoutInput(input);

  expect(actual).toEqual({ quoteId: IDS.quote, acceptServicePolicies: true,
    visits: [{ ...input.visits[0], startAt: new Date(input.visits[0].startAt) }] });
});

// SRS: UC-25 bước 3; III.7.1 Visits per day; GBR-09.
test("BKG-INPUT-01-UTCID02 [N] Hai lượt khác giờ trong một ngày được chấp nhận", () => {
  const input = inputFor([visit(), visit(8)]);

  const actual = bookingCheckoutInput(input);

  expect(actual.visits).toHaveLength(2);
  expect(actual.visits.map(row => row.startAt.toISOString())).toEqual(input.visits.map(row => row.startAt));
});

// SRS: GBR-09; III.7.1 — biên suy ra 30 ngày × 2 lượt/ngày, Customer đã từng trả bill.
test("BKG-INPUT-01-UTCID03 [B] Chấp nhận đủ 60 lượt trong 30 ngày với hai lượt mỗi ngày", () => {
  const input = inputFor(visitsForDays(30));

  const actual = bookingCheckoutInput(input);

  expect(actual.visits).toHaveLength(60);
  expect(actual.visits.map(row => row.startAt.toISOString())).toEqual(input.visits.map(row => row.startAt));
});

// SRS: GBR-09; III.7.1 — tối đa 30 ngày, 2 lượt/ngày; không khẳng định validator đã kiểm tra khoảng ngày.
test("BKG-INPUT-01-UTCID04 [B] Từ chối lượt thứ 61 vượt số lượt tối đa suy ra từ SRS", () => {
  const input = inputFor([...visitsForDays(30), visit(30 * 24)]);

  expect(() => bookingCheckoutInput(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'One to sixty visits required',
  }));
});

// SRS: GBR-34; III.7.1 Responsibility policy.
test("BKG-INPUT-01-UTCID05 [A] Từ chối khi chưa đồng ý chính sách trách nhiệm", () => {
  const input = inputFor();
  input.acceptServicePolicies = false;

  expect(() => bookingCheckoutInput(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'SERVICE_POLICY_CONSENT_REQUIRED', message: 'Accept the quoted service policies',
  }));
});

// SRS: GBR-34; III.7.1 Responsibility policy — trường bắt buộc.
test("BKG-INPUT-01-UTCID06 [A] Từ chối khi thiếu trường đồng ý chính sách bắt buộc", () => {
  const input = inputFor();
  delete input.acceptServicePolicies;

  expect(() => bookingCheckoutInput(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'Invalid fields',
  }));
});

// SRS: UC-25 bước 3; III.7.1 Visits per day / Visit time — phải có lượt và giờ bắt đầu.
test("BKG-INPUT-01-UTCID07 [B] Từ chối lịch không có lượt nào", () => {
  const input = inputFor([]);

  expect(() => bookingCheckoutInput(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'One to sixty visits required',
  }));
});

// SRS: III.7.1 Visit 1 time / Visit 2 time — Required.
test("BKG-INPUT-01-UTCID08 [A] Từ chối lượt thiếu giờ bắt đầu bắt buộc", () => {
  const input = inputFor();
  delete input.visits[0].startAt;

  expect(() => bookingCheckoutInput(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'Invalid fields',
  }));
});

// SRS: UC-25 bước 3; III.7.1 Address — Required.
test("BKG-INPUT-01-UTCID09 [A] Từ chối lượt tại nhà thiếu địa chỉ", () => {
  const input = inputFor();
  delete input.visits[0].addressId;

  expect(() => bookingCheckoutInput(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'Invalid identifier',
  }));
});

// SRS: UC-25 bước 3; III.7.1 Preferred pet sitter; GBR-12 — lựa chọn không bắt buộc.
test("BKG-INPUT-01-UTCID10 [N] Giữ lựa chọn người chăm sóc mong muốn khi có chọn", () => {
  const input = inputFor();
  // Giả định caller đã kiểm tra người này từng chăm pet; validator không có DB.
  input.visits[0].requestedSitterId = IDS.formerSitter;

  const actual = bookingCheckoutInput(input);

  expect(actual.visits[0]).toMatchObject({ requestedSitterId: IDS.formerSitter, addressId: IDS.address });
  expect(actual.acceptServicePolicies).toBe(true);
});
