// JOB-SWEEP-03 — chỉ kiểm thử runOnce; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createOperationalSweepJob } from '../../../src/jobs/operational-sweep.job.js';
const NOW = '2026-11-18T03:00:00.000Z';
function fixture() {
  const row = { operationType: 'OFFER_EXPIRED', aggregateId: 'offer-1', state: 'PENDING', version: 1, deadline: NOW };
  const repository = { findDueOperations: jest.fn(async () => [row]), applyOperationAtomically: jest.fn(async () => ({ status: 'APPLIED' })) };
  const leaseRepository = { acquireLease: async () => ({ status: 'ACQUIRED', fencingToken: 1 }), renewLease: async () => true, releaseLease: async () => {} };
  const job = createOperationalSweepJob({ task: 'offer-expiry', repository, leaseRepository, clock: () => new Date(NOW), logger: () => {} });
  return { row, repository, job };
}

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-03-UTCID01 [B] Lời mời đến hạn tạo command hết hạn", async () => {
  const f = fixture();
  await expect(f.job.runOnce()).resolves.toMatchObject({ applied: 1 });
  expect(f.repository.applyOperationAtomically).toHaveBeenCalledWith(expect.objectContaining({ operationType: 'OFFER_EXPIRED', aggregateId: 'offer-1', expectedState: 'PENDING' }));
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-03-UTCID02 [B] Chưa đến hạn không thu hồi lời mời", async () => {
  const f = fixture(); f.row.deadline = '2026-11-18T03:00:00.001Z';
  await expect(f.job.runOnce()).resolves.toMatchObject({ applied: 0, skipped: 1 });
  expect(f.repository.applyOperationAtomically).not.toHaveBeenCalled();
});

// SRS: JOB-02 dòng 6197–6213; GBR-12 dòng 6535–6536: 2 giờ, 30 phút nếu còn tối đa 24 giờ, không quá giờ bắt đầu.
test("JOB-SWEEP-03-UTCID03 [N] Không thực hiện lại hiệu ứng đã được xử lý", async () => {
  const f = fixture(); f.repository.applyOperationAtomically.mockResolvedValue({ status: 'ALREADY_APPLIED' });
  await expect(f.job.runOnce()).resolves.toMatchObject({ applied: 0, alreadyHandled: 1 });
});
