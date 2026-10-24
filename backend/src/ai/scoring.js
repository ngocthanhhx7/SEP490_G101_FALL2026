import { fail, number, weights as validateWeights } from './validation.js';
export const DEFAULT_WEIGHTS = Object.freeze({
  fit: 30,
  travel: 25,
  quality: 20,
  reliability: 15,
  workload: 10,
});
export const FEATURE_REASONS = Object.freeze({
  fit: 'Kinh nghiệm cùng dịch vụ và loài (20/30), quen từng pet (10/30); không suy luận hành vi từ giống.',
  travel:
    'Phút di chuyển và đệm tăng thêm khi chèn giữa lịch trước và sau; không dùng khoảng cách đường chim bay.',
  quality:
    'Rating 180 ngày được làm mượt với prior 4.5 sao/10 lượt; prior không phải sao công khai.',
  reliability:
    '60% hoàn thành và 40% đúng giờ trong 90 ngày; chỉ tính lỗi đã đối soát, không phạt từ chối offer.',
  workload: 'Phút bận sau chèn/480, gồm phục vụ, đường đi, đệm, chờ và nghỉ.',
});
export function scoreSitter({
  stats,
  historyCounts,
  extraTravelMinutes,
  busyMinutes,
  weights = DEFAULT_WEIGHTS,
}) {
  validateWeights(weights);
  const keys = [
    'similarVisits',
    'ratingSum',
    'ratingCount',
    'completed',
    'faults',
    'onTime',
    'late',
  ];
  for (const key of keys)
    number(stats[key], 0, Number.MAX_SAFE_INTEGER, key !== 'ratingSum');
  if (
    stats.ratingSum < stats.ratingCount ||
    stats.ratingSum > 5 * stats.ratingCount
  )
    fail('STATISTICS_INVALID', 'Rating totals are inconsistent', 409);
  if (!Array.isArray(historyCounts) || !historyCounts.length)
    fail('STATISTICS_INVALID', 'Pet history required', 409);
  historyCounts.forEach((n) => number(n, 0, Number.MAX_SAFE_INTEGER, true));
  number(extraTravelMinutes, 0, 10000);
  number(busyMinutes, 0, 480);
  const E = Math.min(1, stats.similarVisits / 20),
    H = Math.min(1, Math.min(...historyCounts) / 5);
  const adjustedRating = (45 + stats.ratingSum) / (10 + stats.ratingCount);
  const completion =
      (19 + stats.completed) / (20 + stats.completed + stats.faults),
    punctuality = (9 + stats.onTime) / (10 + stats.onTime + stats.late);
  const features = {
    fit: (20 * E + 10 * H) / 30,
    travel: Math.max(0, 1 - extraTravelMinutes / 60),
    quality: (adjustedRating - 1) / 4,
    reliability: 0.6 * completion + 0.4 * punctuality,
    workload: Math.max(0, 1 - busyMinutes / 480),
  };
  const breakdown = Object.entries(features).map(([key, value]) => ({
    key,
    normalized: value,
    weight: weights[key],
    points: value * weights[key],
    explanation: FEATURE_REASONS[key],
  }));
  const rawScore = breakdown.reduce((sum, line) => sum + line.points, 0);
  return {
    rawScore,
    score: Math.round(rawScore * 10) / 10,
    features,
    breakdown,
    rating: stats.ratingCount ? stats.ratingSum / stats.ratingCount : null,
    ratingCount: stats.ratingCount,
    confidence:
      stats.completed >= 20 && stats.ratingCount >= 10
        ? 'ESTABLISHED'
        : 'LIMITED_HISTORY',
  };
}
