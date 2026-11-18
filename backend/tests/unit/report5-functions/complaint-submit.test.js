// COMPLAINT-01 — chỉ kiểm thử submit; mỗi UTCID là một test riêng.
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
test("COMPLAINT-01-UTCID01 [N] Chủ visit gửi khiếu nại và giữ hóa đơn", async () => {
  const f = fixture();
  await expect(f.service.submit(f.submission)).resolves.toMatchObject({ state: 'OPEN', complaint: { billState: 'ON_HOLD' } });
  expect(f.tx.changeHold).toHaveBeenCalled();
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID02 [B] Cho phép gửi đúng 7 ngày sau hoàn thành", async () => {
  const f = fixture(); f.visit.completedAt = new Date(NOW - 7 * DAY);
  await expect(f.service.submit(f.submission)).resolves.toMatchObject({ state: 'OPEN' });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID03 [B] Quá 7 ngày không được mở khiếu nại", async () => {
  const f = fixture(); f.visit.completedAt = new Date(NOW - 7 * DAY - 1);
  await expect(f.service.submit(f.submission)).rejects.toMatchObject({ code: 'COMPLAINT_WINDOW_EXPIRED', status: 409 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID04 [A] Không mở thêm khi có khiếu nại đang mở cùng visit", async () => {
  const f = fixture(); f.data.records.push(f.record);
  await expect(f.service.submit(f.submission)).rejects.toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN', status: 409 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID05 [A] Không gửi thay cho chủ visit khác", async () => {
  const f = fixture(); f.submission.actor = { ...f.customer, userId: 'other-customer' };
  await expect(f.service.submit(f.submission)).rejects.toMatchObject({ status: 404 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID06 [A] Mô tả khiếu nại là bắt buộc", async () => {
  const f = fixture(); f.submission.description = '';
  await expect(f.service.submit(f.submission)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID07 [N] Booking đã kết thúc có thể khiếu nại toàn booking", async () => {
  const f = fixture();
  await expect(f.service.submit({ actor: f.customer, scope: 'BOOKING', bookingId: f.booking.id, expectedVersion: 4, idempotencyKey: 'booking-report-01', description: 'Khiếu nại toàn booking đã kết thúc' })).resolves.toMatchObject({ state: 'OPEN', complaint: { scope: 'BOOKING', visitId: null } });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID08 [A] Booking chưa kết thúc chưa được khiếu nại toàn booking", async () => {
  const f = fixture(); f.visit.state = 'IN_PROGRESS';
  await expect(f.service.submit({ actor: f.customer, scope: 'BOOKING', bookingId: f.booking.id, idempotencyKey: 'booking-report-01', description: 'Khiếu nại toàn booking' })).rejects.toMatchObject({ code: 'BOOKING_NOT_ENDED', status: 409 });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID09 [N] Booking hủy hết nhưng còn hóa đơn phải trả vẫn được khiếu nại", async () => {
  const f = fixture(); f.visit.state = 'CANCELLED'; f.visit.cancelledAt = new Date(NOW - DAY);
  await expect(f.service.submit({ actor: f.customer, scope: 'BOOKING', bookingId: f.booking.id, idempotencyKey: 'booking-report-01', description: 'Khiếu nại phí hủy' })).resolves.toMatchObject({ state: 'OPEN' });
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-01-UTCID10 [A] Booking hủy hết không phát sinh hóa đơn không đủ điều kiện", async () => {
  const f = fixture(); f.visit.state = 'CANCELLED'; f.visit.cancelledAt = new Date(NOW - DAY); f.billing.read.mockResolvedValue({ basis: 'ISSUED', basisAmountVnd: 0, approvedTotalVnd: 0, billTotalVnd: 0, paidInFull: false });
  await expect(f.service.submit({ actor: f.customer, scope: 'BOOKING', bookingId: f.booking.id, idempotencyKey: 'booking-report-01', description: 'Khiếu nại phí hủy' })).rejects.toMatchObject({ code: 'BOOKING_NOT_ELIGIBLE', status: 409 });
});
