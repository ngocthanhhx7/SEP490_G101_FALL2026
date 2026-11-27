// JOB-ASSIGN-01 — chỉ kiểm thử runOnce; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createAutoAssignmentJob } from '../../../src/jobs/auto-assignment.job.js';
function fixture() {
  const row = { visitId: 'visit-1', bookingId: 'booking-1', serviceId: 'DOG_WALK', areaCode: 'DISTRICT_Q1', startAt: '2026-11-20T02:00:00.000Z', endAt: '2026-11-20T03:00:00.000Z', state: 'DISPATCH_PENDING', dispatchAllowed: true, dispatchSequence: 1 };
  const repository = { findDispatchableVisits: jest.fn(async () => [row]), createOfferAtomically: jest.fn(async command => ({ status: 'CREATED', offer: { id: 'offer-1', ...command, state: 'PENDING' } })) };
  const dispatchService = { suggest: jest.fn(async () => ({ selected: [{ sitterId: 'sitter-1', reasons: [] }], rankingSource: 'DETERMINISTIC_RULES' })) };
  const job = createAutoAssignmentJob({ repository, dispatchService, clock: () => new Date('2026-11-18T03:00:00Z') });
  return { row, repository, dispatchService, job };
}

// SRS: JOB-02 dòng 6197–6213; UC-38; GBR-11/12.
test("JOB-ASSIGN-01-UTCID01 [N] Buổi đủ điều kiện tạo lời mời Pending cho sitter được chọn", async () => {
  const f = fixture();
  await expect(f.job.runOnce()).resolves.toMatchObject({ created: 1, offers: [{ sitterId: 'sitter-1', state: 'PENDING' }] });
  expect(f.repository.createOfferAtomically).toHaveBeenCalledWith(expect.objectContaining({ visitId: 'visit-1', sitterId: 'sitter-1' }));
  expect(f.row.state).toBe('DISPATCH_PENDING');
});

// SRS: JOB-02 dòng 6197–6213; UC-38; GBR-11/12.
test("JOB-ASSIGN-01-UTCID02 [A] Chưa thanh toán đủ prepay không gửi lời mời", async () => {
  const f = fixture(); f.row.paymentRequired = true; f.row.paymentStatus = 'PAYMENT_REQUIRED';
  await expect(f.job.runOnce()).resolves.toMatchObject({ skipped: 1, created: 0 });
  expect(f.repository.createOfferAtomically).not.toHaveBeenCalled();
});

// SRS: JOB-02 dòng 6197–6213; UC-38; GBR-11/12.
test("JOB-ASSIGN-01-UTCID03 [N] Không có sitter đủ điều kiện không tạo lời mời", async () => {
  const f = fixture(); f.dispatchService.suggest.mockResolvedValue({ selected: [] });
  await expect(f.job.runOnce()).resolves.toMatchObject({ created: 0 });
  expect(f.repository.createOfferAtomically).not.toHaveBeenCalled();
});
