// JOB-SWEEP-01 — chỉ kiểm thử calculateOfferDeadline; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { calculateOfferDeadline } from '../../../src/jobs/operational-sweep.job.js';
const NOW = '2026-11-18T03:00:00.000Z';

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-01-UTCID01 [N] Còn hơn 24 giờ thì cho 2 giờ phản hồi", async () => {
  expect(calculateOfferDeadline({ offeredAt: NOW, visitStartAt: '2026-11-19T04:00:00.000Z' })).toBe('2026-11-18T05:00:00.000Z');
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-01-UTCID02 [B] Còn đúng 24 giờ thì hạn phản hồi 30 phút", async () => {
  expect(calculateOfferDeadline({ offeredAt: NOW, visitStartAt: '2026-11-19T03:00:00.000Z' })).toBe('2026-11-18T03:30:00.000Z');
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-01-UTCID03 [N] Còn dưới 24 giờ thì hạn phản hồi 30 phút", async () => {
  expect(calculateOfferDeadline({ offeredAt: NOW, visitStartAt: '2026-11-18T08:00:00.000Z' })).toBe('2026-11-18T03:30:00.000Z');
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-01-UTCID04 [B] Hạn phản hồi không vượt giờ visit còn 10 phút", async () => {
  expect(calculateOfferDeadline({ offeredAt: NOW, visitStartAt: '2026-11-18T03:10:00.000Z' })).toBe('2026-11-18T03:10:00.000Z');
});
