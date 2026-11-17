// Phạm vi SRS: xem tham chiếu trước từng UTCID và README cùng thư mục.
import { test, expect } from '@jest/globals';
import { rankEligibleCandidates } from '../../../src/services/dispatch.service.js';

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

// SRS: GBR-12; UC-31 bước 2 — Staff thấy free sitters được xếp hạng kèm lý do, cùng ranking automatic offers.
test("DISPATCH-03-UTCID01 [N] Trả danh sách người đủ điều kiện với thứ hạng và lý do", () => {
  const records = [candidate('sitter-b'), candidate('sitter-a')];

  const actual = rankEligibleCandidates({ request: context(), candidates: records });

  // SRS không ấn định tie-break theo ID, không assert thứ tự khi mọi yếu tố bằng nhau.
  expect(actual.selected.map(row => row.sitterId).sort()).toEqual(['sitter-a', 'sitter-b']);
  expect(actual.selected.map(row => row.rank)).toEqual([1, 2]);
  expect(actual.selected.every(row => Array.isArray(row.reasons) && row.reasons.length > 0)).toBe(true);
  expect(actual.eligibleCount).toBe(2);
  expect(actual.excluded).toEqual([]);
});

// SRS: GBR-04/12/45; JOB-02 bước 1.
test("DISPATCH-03-UTCID02 [A] Loại người không đủ điều kiện trước khi xếp hạng", () => {
  const records = [candidate('sitter-good'), candidate('sitter-suspended', { active: false }),
    candidate('sitter-other-area', { workAreas: ['AREA_B'] }), candidate('sitter-off-hours', { available: false }),
    candidate('sitter-day-off', { isDayOff: true }), candidate('sitter-conflict', { hasConflict: true })];

  const actual = rankEligibleCandidates({ request: context(), candidates: records });

  expect(actual.selected.map(row => row.sitterId)).toEqual(['sitter-good']);
  expect(actual.eligibleCount).toBe(1);
  expect(actual.excluded.map(row => row.sitterId).sort()).toEqual([
    'sitter-conflict', 'sitter-day-off', 'sitter-off-hours', 'sitter-other-area', 'sitter-suspended',
  ]);
});

// SRS: JOB-02 Failure behavior — không ai rank được; caller chuyển Needs action, hàm này chỉ trả danh sách.
test("DISPATCH-03-UTCID03 [A] Không trả người nhận lượt khi tất cả đều bận", () => {
  const records = [candidate('sitter-a', { hasConflict: true }), candidate('sitter-b', { hasConflict: true })];

  const actual = rankEligibleCandidates({ request: context(), candidates: records });

  expect(actual.selected).toEqual([]);
  expect(actual.eligibleCount).toBe(0);
  expect(actual.excluded).toHaveLength(2);
});

// SRS: GBR-12; JOB-02 bước 1 — rating là yếu tố ranking; ca cô lập một yếu tố.
test("DISPATCH-03-UTCID04 [N] Rating cao hơn được ưu tiên khi các yếu tố khác bằng nhau", () => {
  const records = [candidate('sitter-low', { rating: 3.5 }), candidate('sitter-high', { rating: 4.8 })];

  const actual = rankEligibleCandidates({ request: context(), candidates: records });

  expect(actual.selected.map(row => row.sitterId)).toEqual(['sitter-high', 'sitter-low']);
});

// SRS: GBR-12; JOB-02 bước 1 — fewer visits that day; số lượt được port cung cấp.
test("DISPATCH-03-UTCID05 [N] Ít lượt trong ngày hơn được ưu tiên khi các yếu tố khác bằng nhau", () => {
  const records = [candidate('sitter-busy-day', { activeWorkload: 4 }), candidate('sitter-light-day', { activeWorkload: 1 })];

  const actual = rankEligibleCandidates({ request: context(), candidates: records });

  expect(actual.selected.map(row => row.sitterId)).toEqual(['sitter-light-day', 'sitter-busy-day']);
});

// SRS: GBR-12; JOB-02 bước 1 — preferred gets first offer whatever rating or number of visits.
test("DISPATCH-03-UTCID06 [N] Người khách mong muốn đủ điều kiện đứng đầu dù rating thấp và nhiều lượt", () => {
  const records = [candidate('sitter-other', { rating: 5, activeWorkload: 1 }),
    candidate('sitter-preferred', { rating: 3, activeWorkload: 5 })];

  const actual = rankEligibleCandidates({ request: context({ requestedSitterId: 'sitter-preferred' }), candidates: records });

  expect(actual.selected[0]).toMatchObject({ sitterId: 'sitter-preferred', rank: 1 });
});

// SRS: GBR-12; JOB-02 bước 1 — if preferred cannot take the visit, rank other eligible sitters.
// Defect theo SRS: DEF_DISPATCH_PREFERRED_FALLBACK_01. Giữ test thông thường; không skip/failing.
test("DISPATCH-03-UTCID07 [N] Preferred bận thì xếp hạng người đủ điều kiện khác", () => {
  const records = [candidate('sitter-preferred', { hasConflict: true }), candidate('sitter-other')];

  const actual = rankEligibleCandidates({ request: context({ requestedSitterId: 'sitter-preferred' }), candidates: records });

  expect(actual.selected.map(row => row.sitterId)).toEqual(['sitter-other']);
  expect(actual.excluded).toEqual(expect.arrayContaining([
    expect.objectContaining({ sitterId: 'sitter-preferred', reasons: expect.arrayContaining(['VISIT_CONFLICT']) }),
  ]));
});
