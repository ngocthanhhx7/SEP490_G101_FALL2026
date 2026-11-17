// Phạm vi SRS: xem tham chiếu trước từng UTCID và README cùng thư mục.
import { test, expect, jest } from '@jest/globals';
import { createSitterDispatchService } from '../../../src/services/dispatch.service.js';

function request(overrides = {}) {
  // Một lượt HOME đã Confirmed, chưa đến ngày thực hiện, thanh toán sau booking.
  // areaCode là khu vực do caller đã giải quyết từ địa chỉ, không phải input UI.
  return { visitId: 'visit-srs-01', bookingId: 'booking-srs-01', serviceId: 'HOME_CARE',
    areaCode: 'AREA_A', startAt: '2026-11-14T01:00:00.000Z', endAt: '2026-11-14T02:00:00.000Z',
    paymentRequired: false, paymentStatus: 'UNPAID', dispatchAllowed: true, ...overrides };
}

function candidate(sitterId = 'sitter-a', overrides = {}) {
  // Các snapshot do port nội bộ cung cấp; không mô phỏng cách tính giờ/di chuyển.
  // activeWorkload trong fixture là số lượt trong ngày; không chứng minh query đếm.
  return { sitterId, approved: true, active: true, userState: 'ACTIVE',
    services: ['HOME_CARE'], workAreas: ['AREA_A'], available: true, isDayOff: false,
    hasConflict: false, activeWorkload: 2, distanceKm: 2, rating: 4, ratingCount: 10,
    ...overrides };
}

// SRS: UC-25 bước 7/8 và Postconditions; GBR-12; JOB-02 bước 1.
test("DISPATCH-04-UTCID01 [N] Đọc ứng viên và trả đề xuất cho lượt đã Confirmed chưa thanh toán", async () => {
  const records = [candidate('sitter-a'), candidate('sitter-b')];
  const listCandidates = jest.fn(async () => records);
  const suggest = createSitterDispatchService({ listCandidates }).suggest;
  const input = request();

  const actual = await suggest({ request: input });

  expect(actual.selected.map(row => row.sitterId).sort()).toEqual(['sitter-a', 'sitter-b']);
  expect(actual.selected.map(row => row.rank)).toEqual([1, 2]);
  expect(listCandidates).toHaveBeenCalledTimes(1);
  expect(listCandidates.mock.calls[0][0].request).toMatchObject({ serviceId: 'HOME_CARE', areaCode: 'AREA_A',
    startAt: new Date(input.startAt), endAt: new Date(input.endAt), paymentStatus: 'UNPAID' });
});

// SRS: GBR-04/12/45; JOB-02 bước 1 — điều kiện bắt buộc không bị ranking ghi đè.
test("DISPATCH-04-UTCID02 [A] Ranker chỉ nhận người vượt qua các điều kiện bắt buộc", async () => {
  const records = [candidate('sitter-a'), candidate('sitter-b'), candidate('sitter-suspended', { active: false }),
    candidate('sitter-other-area', { workAreas: ['AREA_B'] }), candidate('sitter-off-hours', { available: false }),
    candidate('sitter-day-off', { isDayOff: true }), candidate('sitter-conflict', { hasConflict: true })];
  const listCandidates = jest.fn(async () => records);
  const ranker = jest.fn(async ({ candidates }) => candidates.map(row => row.sitterId).reverse());
  const suggest = createSitterDispatchService({ listCandidates, ranker }).suggest;

  const actual = await suggest({ request: request() });

  expect(ranker).toHaveBeenCalledTimes(1);
  expect(ranker.mock.calls[0][0].candidates.map(row => row.sitterId).sort()).toEqual(['sitter-a', 'sitter-b']);
  expect(actual.selected.map(row => row.sitterId).sort()).toEqual(['sitter-a', 'sitter-b']);
  expect(actual.excluded).toHaveLength(5);
});

// SRS: JOB-02 Failure behavior — all off/outside areas/busy; GBR-12.
test("DISPATCH-04-UTCID03 [A] Không có người đủ điều kiện thì trả danh sách đề xuất rỗng", async () => {
  const listCandidates = jest.fn(async () => [candidate('sitter-off', { isDayOff: true }),
    candidate('sitter-busy', { hasConflict: true })]);
  const suggest = createSitterDispatchService({ listCandidates }).suggest;

  const actual = await suggest({ request: request() });

  expect(actual.selected).toEqual([]);
  expect(actual.eligibleCount).toBe(0);
  expect(actual.excluded).toHaveLength(2);
});

// SRS: GBR-12; JOB-02 bước 1 — ưu tiên preferred dù rating/số lượt khác.
test("DISPATCH-04-UTCID04 [N] Ưu tiên người khách mong muốn khi người đó đủ điều kiện", async () => {
  const listCandidates = jest.fn(async () => [candidate('sitter-other', { rating: 5, activeWorkload: 1 }),
    candidate('sitter-preferred', { rating: 3, activeWorkload: 5 })]);
  const suggest = createSitterDispatchService({ listCandidates }).suggest;

  const actual = await suggest({ request: request({ requestedSitterId: 'sitter-preferred' }) });

  expect(actual.selected[0]).toMatchObject({ sitterId: 'sitter-preferred', rank: 1 });
});

// SRS: GBR-12; JOB-02 bước 1 — if preferred cannot take the visit, rank other eligible sitters.
// Defect theo SRS: DEF_DISPATCH_PREFERRED_FALLBACK_01. Giữ test thông thường; không skip/failing.
test("DISPATCH-04-UTCID05 [N] Đề xuất người khác khi người khách mong muốn đang bận", async () => {
  const listCandidates = jest.fn(async () => [candidate('sitter-preferred', { hasConflict: true }),
    candidate('sitter-other')]);
  const suggest = createSitterDispatchService({ listCandidates }).suggest;

  const actual = await suggest({ request: request({ requestedSitterId: 'sitter-preferred' }) });

  expect(actual.selected.map(row => row.sitterId)).toEqual(['sitter-other']);
  expect(listCandidates).toHaveBeenCalledTimes(1);
});
