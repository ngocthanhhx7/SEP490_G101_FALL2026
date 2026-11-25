// JOB-SWEEP-02 — chỉ kiểm thử canAcceptOfferAt; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { canAcceptOfferAt } from '../../../src/jobs/operational-sweep.job.js';
const NOW = '2026-11-18T03:00:00.000Z';

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-02-UTCID01 [B] Ngay trước hạn vẫn nhận được lời mời Pending", async () => {
  expect(canAcceptOfferAt({ state: 'PENDING', deadline: '2026-11-18T03:00:00.001Z', asOf: NOW })).toBe(true);
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-02-UTCID02 [B] Đến hạn không nhận được lời mời nữa", async () => {
  expect(canAcceptOfferAt({ state: 'PENDING', deadline: NOW, asOf: NOW })).toBe(false);
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-02-UTCID03 [A] Lời mời đã hết hiệu lực không thể nhận", async () => {
  expect(canAcceptOfferAt({ state: 'EXPIRED', deadline: '2026-11-18T03:30:00.000Z', asOf: NOW })).toBe(false);
});
