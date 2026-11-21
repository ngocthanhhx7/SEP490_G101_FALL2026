import { test, expect, jest } from '@jest/globals';
import { createAiService } from '../../../src/services/sitter-matching/recommendation.service.js';
const OWNER = '111111111111111111111111', PET = '222222222222222222222222';
const SERVICE = '333333333333333333333333', ADDRESS = '444444444444444444444444';
const SITTER = '555555555555555555555555';
const NOW = Date.parse('2026-11-16T03:00:00Z');
function fixture({ history = false, newcomer = false, dayOff = false, overlap = false, confirmed = true } = {}) {
  const saved = [];
  const profile = { userId: SITTER, version: 0, maxPets: 3, species: ['DOG'], maxWeightKg: 40, allowedTraits: [],
    starts: [{ localDate: '2026-11-18', point: [106.7, 10.8], availableFrom: '2026-11-18T08:00:00+07:00', availableUntil: '2026-11-18T18:00:00+07:00' }],
    windows: [{ weekday: 3, startMinute: 480, endMinute: 1080 }], dayOffDates: dayOff ? ['2026-11-18'] : [] };
  const blocks = overlap ? [{ _id: 'old', sitterId: SITTER, kind: 'VISIT', startAt: '2026-11-18T10:15:00+07:00',
    endAt: '2026-11-18T10:45:00+07:00', point: [106.71, 10.81] }] : [];
  const repository = {
    hasCompletedCare: jest.fn(async () => history),
    context: jest.fn(async () => ({ service: { code: 'home-visit' }, pets: [{ _id: PET, version: 0,
      careNeedsConfirmed: confirmed, species: 'DOG', weightKg: 10, traits: [] }], address: { version: 0, point: { coordinates: [106.71, 10.81] } } })),
    ranking: async () => ({ policy: { version: 1, weights: { fit: 30, travel: 25, quality: 20, reliability: 15, workload: 10 } }, model: null }),
    candidates: async () => ({ profiles: [profile], users: [{ _id: SITTER, displayName: 'Sitter tổng hợp' }], blocks,
      truncated: false, excludedEligibility: 0, statisticsSnapshot: {} }),
    statistics: async () => ({ stats: newcomer
      ? { similarVisits: 0, ratingSum: 0, ratingCount: 0, completed: 0, faults: 0, onTime: 0, late: 0 }
      : { similarVisits: 20, ratingSum: 100, ratingCount: 20, completed: 30, faults: 0, onTime: 30, late: 0 },
    historyCounts: [newcomer ? 0 : 5], asOf: new Date(NOW) }),
    models: { RoutingMatrixCache: { find: () => ({ lean: async () => [] }), bulkWrite: async () => ({ ok: 1 }) },
      DecisionSnapshot: { create: jest.fn(async rows => { saved.push(...rows); return rows.map(row => ({ ...row, _id: '666666666666666666666666' })); }) } }
  };
  const provider = { edgeKey: (a, b) => JSON.stringify([a, b]), matrix: async points => ({
    map: new Map(points.flatMap(a => points.map(b => [JSON.stringify([a, b]), JSON.stringify(a) === JSON.stringify(b) ? 0 : 5]))),
    source: 'SYNTHETIC_ETA', recordedAt: new Date(NOW) }) };
  return { target: createAiService({ repository, routingProvider: provider, clock: () => NOW }).recommend,
    repository, saved, body: { serviceId: SERVICE, petIds: [PET], addressId: ADDRESS,
      startAt: '2026-11-18T10:00:00+07:00', endAt: '2026-11-18T11:00:00+07:00' } };
}

// SRS: UC-25; GBR-09/12/45; JOB-02: chỉ gợi ý sitter rảnh trong giờ, giữ đường đi; không cấm khách cũ hoặc loại sitter chỉ vì mới.
test("AI-REC-01-UTCID01 [N] Trả sitter khả thi mà không tạo phân công", async () => {
  const f = fixture();
  const actual = await f.target(OWNER, f.body);
  expect(actual.candidates.map(row => row.sitterId)).toEqual([SITTER]);
  expect(f.saved).toHaveLength(1); expect(f.saved[0]).toMatchObject({ ownerId: OWNER, kind: 'MATCH' });
  expect(f.saved[0].snapshot.input).toEqual(f.body);
  expect(f.body).toEqual(f.saved[0].snapshot.input);
});

// SRS: GBR-12; JOB-02: rest can get the offer; không quy định ngưỡng điểm tối thiểu
// DEF_REC_NEW_SITTER_THRESHOLD: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("AI-REC-01-UTCID02 [N] Sitter mới vẫn được xét nếu đủ điều kiện nhận visit", async () => {
  const f = fixture({ newcomer: true });
  const actual = await f.target(OWNER, f.body);
  expect(actual.candidates.map(row => row.sitterId)).toContain(SITTER);
});

// SRS: UC-25; GBR-12: khách có thể xin sitter từng chăm pet, không cấm matching cho khách cũ
// DEF_REC_RETURNING_CUSTOMER: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("AI-REC-01-UTCID03 [N] Khách đã từng dùng dịch vụ vẫn được gợi ý sitter", async () => {
  const f = fixture({ history: true });
  const actual = await f.target(OWNER, f.body);
  expect(actual.candidates.map(row => row.sitterId)).toContain(SITTER);
});

// SRS: GBR-12/45; JOB-02
test("AI-REC-01-UTCID04 [A] Không trả sitter đang nghỉ ngày được chọn", async () => {
  const f = fixture({ dayOff: true });
  const actual = await f.target(OWNER, f.body);
  expect(actual.candidates).toEqual([]); expect(actual.exclusions.DAY_OFF).toBe(1);
});

// SRS: GBR-12; JOB-02
test("AI-REC-01-UTCID05 [A] Không trả sitter bị trùng visit đã nhận", async () => {
  const f = fixture({ overlap: true });
  const actual = await f.target(OWNER, f.body);
  expect(actual.candidates).toEqual([]); expect(actual.exclusions.VISIT_CONFLICT).toBe(1);
});

// SRS: UC-25; GBR-09
test("AI-REC-01-UTCID06 [A] Từ chối slot chưa đủ 24 giờ", async () => {
  const f = fixture(); f.body.startAt = "2026-11-17T09:59:00+07:00"; f.body.endAt = "2026-11-17T10:59:00+07:00";
  await expect(f.target(OWNER, f.body)).rejects.toMatchObject({ code: 'SLOT_INVALID', status: 422 });
  expect(f.saved).toEqual([]);
});

// SRS: UC-25 bước5; UC-40
test("AI-REC-01-UTCID07 [A] Phải xác nhận thông tin chăm sóc trước matching", async () => {
  const f = fixture({ confirmed: false });
  await expect(f.target(OWNER, f.body)).rejects.toMatchObject({ code: 'CARE_INFORMATION_REQUIRED', status: 409 });
  expect(f.saved).toEqual([]);
});
