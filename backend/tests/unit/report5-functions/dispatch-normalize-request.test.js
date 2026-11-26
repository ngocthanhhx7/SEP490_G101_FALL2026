// Phạm vi SRS: xem tham chiếu trước từng UTCID và README cùng thư mục.
import { test, expect } from '@jest/globals';
import { normalizeDispatchRequest } from '../../../src/services/dispatch.service.js';

function request(overrides = {}) {
  // Một lượt HOME đã Confirmed, chưa đến ngày thực hiện, thanh toán sau booking.
  // areaCode là khu vực do caller đã giải quyết từ địa chỉ, không phải input UI.
  return { visitId: 'visit-srs-01', bookingId: 'booking-srs-01', serviceId: 'HOME_CARE',
    areaCode: 'AREA_A', startAt: '2026-11-14T01:00:00.000Z', endAt: '2026-11-14T02:00:00.000Z',
    paymentRequired: false, paymentStatus: 'UNPAID', dispatchAllowed: true, ...overrides };
}

// SRS: UC-25 bước 3/7/8 và Postconditions; III.7.1 — Confirmed và trả sau booking.
test("DISPATCH-01-UTCID01 [N] Lượt đã xác nhận chưa thanh toán được chuẩn hóa cho điều phối", () => {
  const input = request();

  const actual = normalizeDispatchRequest(input);

  expect(actual).toMatchObject({ serviceId: 'HOME_CARE', areaCode: 'AREA_A',
    startAt: new Date(input.startAt), endAt: new Date(input.endAt),
    dispatchAllowed: true, paymentRequired: false, paymentStatus: 'UNPAID', requestedSitterId: null });
});

// SRS: UC-25 bước 3; III.7.1 Preferred pet sitter; GBR-12 — lựa chọn optional.
test("DISPATCH-01-UTCID02 [N] Giữ người chăm sóc mong muốn khi khách có chọn", () => {
  const input = request({ requestedSitterId: 'sitter-preferred' });

  const actual = normalizeDispatchRequest(input);

  expect(actual.requestedSitterId).toBe('sitter-preferred');
  expect(actual.serviceId).toBe('HOME_CARE');
});

// SRS: UC-25 bước 1/3; III.7.1 Service — Required; ánh xạ dịch vụ vào context nội bộ.
test("DISPATCH-01-UTCID03 [A] Từ chối context không có dịch vụ cần chăm sóc", () => {
  const input = request();
  delete input.serviceId;

  expect(() => normalizeDispatchRequest(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'serviceId is required',
  }));
});

// SRS: UC-25 bước 3; GBR-10/12 — địa chỉ có khu vực phục vụ; ánh xạ vào areaCode nội bộ.
test("DISPATCH-01-UTCID04 [A] Từ chối context thiếu khu vực của lượt chăm sóc", () => {
  const input = request();
  delete input.areaCode;

  expect(() => normalizeDispatchRequest(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'areaCode is required',
  }));
});

// SRS: UC-25 bước 3; III.7.1 Visit time — Required; GBR-12 xét giờ làm/bận rảnh.
test("DISPATCH-01-UTCID05 [A] Từ chối context thiếu giờ bắt đầu của lượt", () => {
  const input = request();
  delete input.startAt;

  expect(() => normalizeDispatchRequest(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'startAt must include a timezone offset',
  }));
});
