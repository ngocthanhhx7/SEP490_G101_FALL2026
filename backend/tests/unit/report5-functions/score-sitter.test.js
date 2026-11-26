import { test, expect } from '@jest/globals';
import { scoreSitter } from '../../../src/services/sitter-matching/scoring.service.js';
function input() { return { stats: { similarVisits: 10, ratingSum: 12, ratingCount: 3,
  completed: 10, faults: 1, onTime: 9, late: 1 }, historyCounts: [1], extraTravelMinutes: 10, busyMinutes: 120 }; }

// SRS: GBR-12; JOB-02; III Dispatch Board: familiarity, customer rating, fewer daily visits; algorithm tự đặt trọng số.
test("AI-SCORE-01-UTCID01 [N] Đã chăm pet được ưu tiên hơn chưa chăm khi yếu tố khác bằng nhau", async () => {
  const a = scoreSitter({ ...input(), historyCounts: [0] });
  const b = scoreSitter({ ...input(), historyCounts: [1] });
  expect(b.rawScore).toBeGreaterThan(a.rawScore);
});

// SRS: GBR-12; JOB-02; III Dispatch Board: familiarity, customer rating, fewer daily visits; algorithm tự đặt trọng số.
test("AI-SCORE-01-UTCID02 [N] Đánh giá tốt hơn được ưu tiên khi số lượt đánh giá bằng nhau", async () => {
  const base = input();
  const low = scoreSitter({ ...base, stats: { ...base.stats, ratingSum: 9 } });
  const high = scoreSitter({ ...base, stats: { ...base.stats, ratingSum: 15 } });
  expect(high.rawScore).toBeGreaterThan(low.rawScore);
});

// SRS: GBR-12; JOB-02; III Dispatch Board: mức bận trong ngày thấp hơn được ưu tiên khi yếu tố khác bằng nhau.
test("AI-SCORE-01-UTCID03 [N] Mức bận trong ngày thấp hơn được ưu tiên khi yếu tố khác bằng nhau", async () => {
  const less = scoreSitter({ ...input(), busyMinutes: 60 });
  const more = scoreSitter({ ...input(), busyMinutes: 120 });
  expect(less.rawScore).toBeGreaterThan(more.rawScore);
});

// SRS: GBR-12; JOB-02; policy cố định đã duyệt ưu tiên di chuyển tăng thêm thấp hơn.
test("AI-SCORE-01-UTCID04 [N] Thời gian di chuyển tăng thêm thấp hơn được ưu tiên khi yếu tố khác bằng nhau", async () => {
  const a = scoreSitter({ ...input(), extraTravelMinutes: 5 });
  const b = scoreSitter({ ...input(), extraTravelMinutes: 20 });
  expect(a.rawScore).toBeGreaterThan(b.rawScore);
});

// SRS: GBR-12; JOB-02; policy cố định đã duyệt ghi nhận kinh nghiệm lượt tương tự.
test("AI-SCORE-01-UTCID05 [N] Kinh nghiệm cùng dịch vụ cao hơn có điểm cao hơn khi yếu tố khác bằng nhau", async () => {
  const base = input();
  const a = scoreSitter({ ...base, stats: { ...base.stats, similarVisits: 0 } });
  const b = scoreSitter({ ...base, stats: { ...base.stats, similarVisits: 10 } });
  expect(b.rawScore).toBeGreaterThan(a.rawScore);
});
