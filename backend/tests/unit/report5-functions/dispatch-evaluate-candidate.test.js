// Phạm vi SRS: xem tham chiếu trước từng UTCID và README cùng thư mục.
import { test, expect } from '@jest/globals';
import { evaluateCandidate } from '../../../src/services/dispatch.service.js';

function context(overrides = {}) {
  // Dựng context độc lập; không gọi normalizeDispatchRequest để chuẩn bị test.
  return { visitId: 'visit-srs-01', bookingId: 'booking-srs-01', serviceId: 'HOME_CARE',
    areaCode: 'AREA_A', startAt: new Date('2026-11-14T01:00:00.000Z'),
    endAt: new Date('2026-11-14T02:00:00.000Z'), localDate: '2026-11-14',
    paymentRequired: false, paymentStatus: 'UNPAID', dispatchAllowed: true,
    requestedSitterId: null, ...overrides };
}

function candidate(sitterId = 'sitter-a', overrides = {}) {
  // Các snapshot do port nội bộ cung cấp; không mô phỏng cách tính giờ/di chuyển.
  // activeWorkload trong fixture là số lượt trong ngày; không chứng minh query đếm.
  return { sitterId, approved: true, active: true, userState: 'ACTIVE',
    services: ['HOME_CARE'], workAreas: ['AREA_A'], available: true, isDayOff: false,
    hasConflict: false, activeWorkload: 2, distanceKm: 2, rating: 4, ratingCount: 10,
    ...overrides };
}

// SRS: GBR-12/28/45; JOB-02 bước 1.
test("DISPATCH-02-UTCID01 [N] Người đã duyệt và đủ điều kiện được xét nhận lượt", () => {
  const actual = evaluateCandidate(candidate(), context());

  expect(actual).toMatchObject({ eligible: true, sitterId: 'sitter-a',
    candidate: { sitterId: 'sitter-a', serviceId: 'HOME_CARE', areaCode: 'AREA_A' } });
});

// SRS: GBR-28 — chỉ tạo pet sitter account khi Admin duyệt.
test("DISPATCH-02-UTCID02 [A] Không xét người chưa được duyệt làm pet sitter", () => {
  const value = candidate('sitter-a', { approved: false });

  const actual = evaluateCandidate(value, context());

  expect(actual).toMatchObject({ eligible: false, sitterId: 'sitter-a' });
  expect(actual.reasons).toContain('NOT_APPROVED');
});

// SRS: GBR-04 — suspended sitter vẫn đăng nhập được nhưng không nhận visits mới.
test("DISPATCH-02-UTCID03 [A] Người bị đình chỉ không nhận lượt mới", () => {
  const value = candidate('sitter-a', { active: false });

  const actual = evaluateCandidate(value, context());

  expect(actual).toMatchObject({ eligible: false, sitterId: 'sitter-a' });
  expect(actual.reasons).toContain('NOT_ACTIVE');
});

// SRS: GBR-12/45; JOB-02 bước 1 — ngoài khu vực bị loại khỏi tự động offer.
test("DISPATCH-02-UTCID04 [A] Không xét người ngoài khu vực phục vụ của lượt", () => {
  const value = candidate('sitter-a', { workAreas: ['AREA_B'] });

  const actual = evaluateCandidate(value, context());

  expect(actual).toMatchObject({ eligible: false, sitterId: 'sitter-a' });
  expect(actual.reasons).toContain('AREA_MISMATCH');
});

// SRS: GBR-12/45; JOB-02 bước 1 — ngoài giờ làm/ca.
test("DISPATCH-02-UTCID05 [A] Không xét người không làm trong khung giờ của lượt", () => {
  const value = candidate('sitter-a', { available: false });

  const actual = evaluateCandidate(value, context());

  expect(actual).toMatchObject({ eligible: false, sitterId: 'sitter-a' });
  expect(actual.reasons).toContain('NOT_AVAILABLE');
});

// SRS: JOB-02 bước 1 — leave out sitters who are off; GBR-45.
test("DISPATCH-02-UTCID06 [A] Không xét người đang nghỉ vào ngày của lượt", () => {
  const value = candidate('sitter-a', { isDayOff: true });

  const actual = evaluateCandidate(value, context());

  expect(actual).toMatchObject({ eligible: false, sitterId: 'sitter-a' });
  expect(actual.reasons).toContain('DAY_OFF');
});

// SRS: GBR-12; JOB-02 bước 1 — busy, travel time included.
test("DISPATCH-02-UTCID07 [A] Không xét người bận gồm cả xung đột thời gian di chuyển", () => {
  const value = candidate('sitter-a', { hasConflict: true });

  const actual = evaluateCandidate(value, context());

  expect(actual).toMatchObject({ eligible: false, sitterId: 'sitter-a' });
  expect(actual.reasons).toContain('VISIT_CONFLICT');
});

// SRS: GBR-12; JOB-02 bước 1 — khi preferred không nhận được, xét người đủ điều kiện khác.
// Defect theo SRS: DEF_DISPATCH_PREFERRED_FALLBACK_01. Giữ test thông thường; không skip/failing.
test("DISPATCH-02-UTCID08 [N] Ứng viên khác vẫn đủ điều kiện dù khách có người mong muốn", () => {
  // GBR-12: preferred là ưu tiên, không phải điều kiện loại người khác.
  const input = context({ requestedSitterId: 'sitter-preferred' });

  const actual = evaluateCandidate(candidate('sitter-a'), input);

  expect(actual).toMatchObject({ eligible: true, sitterId: 'sitter-a' });
});
