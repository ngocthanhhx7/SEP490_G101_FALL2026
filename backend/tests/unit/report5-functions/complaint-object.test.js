// COMPLAINT-04 — chỉ kiểm thử object; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createComplaintService } from '../../../src/services/complaints/complaint.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z'), DAY = 86400000;
function fixture() {
  const customer = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: NOW + DAY };
  const staff = { ...customer, userId: 'staff-1', roles: ['STAFF'] };
  const admin = { ...customer, userId: 'admin-1', roles: ['ADMIN'] };
  const booking = { id: 'booking-1', customerId: customer.userId, version: 4 };
  const visit = { id: 'visit-1', bookingId: booking.id, sitterId: 'sitter-1', state: 'COMPLETED', completedAt: new Date(NOW - DAY), version: 1 };
  const record = { id: 'complaint-1', kind: 'COMPLAINT', complaintSchemaVersion: 2, scope: 'VISIT', bookingId: booking.id, visitId: visit.id, customerId: customer.userId, sitterId: visit.sitterId, description: 'Chất lượng chưa đúng thỏa thuận', state: 'OPEN', version: 0, objectionCount: 0, createdAt: new Date(NOW - 3600000) };
  const data = { records: [] };
  const tx = {
    getBooking: async () => booking, getVisit: async () => visit, getVisits: async () => [visit],
    bookingComplaints: async () => data.records, guardBooking: async b => b,
    getComplaint: async () => record, assertEvidence: jest.fn(async () => {}), changeHold: jest.fn(async () => {}),
    createComplaint: jest.fn(async r => { data.records.push(r); return r; }),
    updateComplaint: jest.fn(async ({ expectedVersion, changes }) => Object.assign(record, changes, { version: expectedVersion + 1 })),
    getIdempotencyResult: async () => null, saveIdempotencyResult: async () => {}, recordEvent: jest.fn(async () => {})
  };
  const billing = { read: jest.fn(async () => ({ basis: 'ISSUED', basisAmountVnd: 100000, approvedTotalVnd: 20000, billTotalVnd: 100000, paidInFull: false })), applyAdjustment: jest.fn(async () => ({ applied: true })) };
  const service = createComplaintService({ repository: { run: async work => work(tx) }, billing, clock: () => NOW });
  const submission = { actor: customer, visitId: visit.id, expectedVersion: 1, idempotencyKey: 'report5-submit-01', description: record.description };
  const command = { actor: staff, complaintId: record.id, expectedVersion: 0, idempotencyKey: 'report5-mutate-01' };
  return { customer, staff, admin, booking, visit, record, data, tx, billing, service, submission, command };
}

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-04-UTCID01 [B] Khách phản đối trước khi hết 72 giờ", async () => {
  const f = fixture(); f.record.state = 'RESOLVED'; f.record.appealUntil = new Date(NOW + 1); f.record.resultDeliveredAt = new Date(NOW - 72 * 3600000 + 1);
  await expect(f.service.object({ ...f.command, actor: f.customer, reason: 'Kết quả chưa phù hợp' })).resolves.toMatchObject({ state: 'ESCALATED' });
  expect(f.record.objectionCount).toBe(1);
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-04-UTCID02 [B] Quá 72 giờ không được phản đối", async () => {
  const f = fixture(); f.record.state = 'RESOLVED'; f.record.appealUntil = new Date(NOW + 1); f.record.resultDeliveredAt = new Date(NOW - 72 * 3600000 + 1); f.record.appealUntil = new Date(NOW - 1);
  await expect(f.service.object({ ...f.command, actor: f.customer, reason: 'Kết quả chưa phù hợp' })).rejects.toMatchObject({ code: 'OBJECTION_WINDOW_EXPIRED', status: 409 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-04-UTCID03 [A] Không được phản đối lần thứ hai", async () => {
  const f = fixture(); f.record.state = 'RESOLVED'; f.record.appealUntil = new Date(NOW + 1); f.record.resultDeliveredAt = new Date(NOW - 72 * 3600000 + 1); f.record.objectionCount = 1;
  await expect(f.service.object({ ...f.command, actor: f.customer, reason: 'Phản đối tiếp' })).rejects.toMatchObject({ code: 'OBJECTION_ALREADY_USED', status: 409 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-04-UTCID04 [A] Phản đối phải có lý do", async () => {
  const f = fixture(); f.record.state = 'RESOLVED'; f.record.appealUntil = new Date(NOW + 1); f.record.resultDeliveredAt = new Date(NOW - 72 * 3600000 + 1);
  await expect(f.service.object({ ...f.command, actor: f.customer, reason: '' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});
